// src/modules/sales/sale.service.ts
import mongoose, { Types } from "mongoose";
import Sale, { ISale, ISaleItem, ISalePayment } from "./sale.model";
import Customer, { ICustomer } from "./customer.model";
import Product from "../products/product.model";
import { stockService } from "../stock/stock.service";
import Warehouse from "../warehouses/warehouse.model";
import {
  parsePagination,
  buildPaginationMeta,
  buildSearchQuery,
  buildDateRangeQuery,
} from "../../shared/utils/pagination";
import { getOrSet, deleteCache, CachePrefix } from "../../shared/utils/cache";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";
import { emitToTenant } from "../../server";
import logger from "../../config/logger";

// ── Order number generator ───────────────────────────────────────────────────
async function generateOrderNumber(
  tenantId: string,
  type: string,
): Promise<string> {
  const prefix =
    type === "invoice" ? "INV" : type === "quotation" ? "QUO" : "SO";
  const d = new Date();
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const count = await Sale.countDocuments({
    tenantId,
    type,
    createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
  });
  return `${prefix}-${yyyymm}-${String(count + 1).padStart(4, "0")}`;
}

function generateCustomerNumber(tenantId: string): string {
  return `CUST-${Date.now().toString(36).toUpperCase()}`;
}

// ── Cart calculations ────────────────────────────────────────────────────────
interface CartItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
  notes?: string;
  name?: string;
  sku?: string;
}

interface CartInput {
  items: CartItemInput[];
  discountType?: "none" | "percent" | "fixed";
  discountValue?: number;
  shippingAmount?: number;
}

interface CartResult {
  items: Omit<ISaleItem, "_id">[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
}

function calculateCart(
  input: CartInput,
  products: Map<
    string,
    { name: string; sku: string; costPrice: number; tax: { taxRate?: number } }
  >,
): CartResult {
  let subtotal = 0;
  let taxAmount = 0;
  let totalDiscount = 0;

  const items: Omit<ISaleItem, "_id">[] = input.items.map((i) => {
    const prod = products.get(i.productId);
    const name = i.name || prod?.name || "Unknown";
    const sku = i.sku || prod?.sku || "";

    const itemSubtotal = i.unitPrice * i.quantity;
    const itemDiscPercent = i.discountPercent ?? 0;
    const itemDiscAmount =
      i.discountAmount ??
      parseFloat(((itemSubtotal * itemDiscPercent) / 100).toFixed(2));
    const taxRate = i.taxRate ?? prod?.tax?.taxRate ?? 0;
    const taxableAmount = itemSubtotal - itemDiscAmount;
    const itemTax = parseFloat(((taxableAmount * taxRate) / 100).toFixed(2));
    const itemTotal = parseFloat((taxableAmount + itemTax).toFixed(2));

    subtotal += itemSubtotal;
    taxAmount += itemTax;
    totalDiscount += itemDiscAmount;

    return {
      productId: new Types.ObjectId(i.productId) as unknown as Types.ObjectId,
      variantId: i.variantId
        ? (new Types.ObjectId(i.variantId) as unknown as Types.ObjectId)
        : undefined,
      name,
      sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      costPrice: i.costPrice || prod?.costPrice || 0,
      discountPercent: itemDiscPercent,
      discountAmount: itemDiscAmount,
      taxRate,
      taxAmount: itemTax,
      subtotal: itemSubtotal,
      total: itemTotal,
      notes: i.notes,
      returnedQuantity: 0,
    };
  });

  // Order-level discount
  const shipping = input.shippingAmount ?? 0;
  let orderDiscount = 0;
  if (input.discountType === "percent") {
    orderDiscount = parseFloat(
      (((subtotal - totalDiscount) * (input.discountValue ?? 0)) / 100).toFixed(
        2,
      ),
    );
  } else if (input.discountType === "fixed") {
    orderDiscount = input.discountValue ?? 0;
  }

  const grandTotal = parseFloat(
    (subtotal - totalDiscount - orderDiscount + taxAmount + shipping).toFixed(
      2,
    ),
  );

  return {
    items,
    subtotal,
    discountAmount: totalDiscount + orderDiscount,
    taxAmount,
    shippingAmount: shipping,
    total: Math.max(0, grandTotal),
  };
}

// ── Payment status helper ────────────────────────────────────────────────────
function calcPaymentStatus(
  total: number,
  amountPaid: number,
): ISale["paymentStatus"] {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid < total - 0.01) return "partial";
  if (Math.abs(amountPaid - total) < 0.01) return "paid";
  return "overpaid";
}

// ── Main service ─────────────────────────────────────────────────────────────
export class SaleService {
  // ── Create sale / POS order ────────────────────────────────────────────────
  async createSale(
    input: {
      type?: ISale["type"];
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      warehouseId: string;
      items: CartItemInput[];
      discountType?: CartInput["discountType"];
      discountValue?: number;
      shippingAmount?: number;
      payments?: Array<{
        method: ISalePayment["method"];
        amount: number;
        reference?: string;
        provider?: string;
        notes?: string;
      }>;
      notes?: string;
      internalNotes?: string;
      saleDate?: Date;
      dueDate?: Date;
      purchaseOrderNumber?: string;
      currency?: string;
      cashRegisterId?: string;
      shiftId?: string;
      tags?: string[];
    },
    tenantId: string,
    userId: string,
  ): Promise<ISale> {
    // NO TRANSACTIONS - Free tier doesn't support them
    
    try {
      const type = input.type ?? "pos";

      // Validate warehouse
      const warehouse = await Warehouse.findOne({
        _id: input.warehouseId,
        tenantId,
      });
      if (!warehouse) throw new NotFoundError("Warehouse");

      // Load products for cart calculation
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await Product.find({
        _id: { $in: productIds },
        tenantId,
      });
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      for (const item of input.items) {
        if (!productMap.has(item.productId))
          throw new NotFoundError(`Product ${item.productId}`);
      }

      // Calculate cart totals
      const cart = calculateCart(
        {
          items: input.items,
          discountType: input.discountType,
          discountValue: input.discountValue,
          shippingAmount: input.shippingAmount,
        },
        new Map(
          products.map((p) => [
            p._id.toString(),
            { name: p.name, sku: p.sku, costPrice: p.costPrice, tax: p.tax },
          ]),
        ),
      );

      // Calculate payments
      const payments: Omit<ISalePayment, "_id">[] = (input.payments ?? []).map(
        (p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference,
          provider: p.provider,
          notes: p.notes,
          status: "completed" as const,
          paidAt: new Date(),
        }),
      );
      const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
      const amountDue = Math.max(0, cart.total - amountPaid);
      const changeGiven = Math.max(0, amountPaid - cart.total);
      const paymentStatus = calcPaymentStatus(cart.total, amountPaid);

      // Generate order number
      const orderNumber = await generateOrderNumber(tenantId, type);

      // Determine sale status
      let status: ISale["status"] = "completed";
      if (type === "quotation") status = "draft";
      else if (type === "invoice" && paymentStatus !== "paid")
        status = "confirmed";
      else if (type === "credit_sale") status = "confirmed";

      // Create sale (FIRST STEP)
      const sale = await Sale.create({
        orderNumber,
        type,
        status,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        warehouseId: input.warehouseId,
        items: cart.items,
        subtotal: cart.subtotal,
        discountType: input.discountType ?? "none",
        discountValue: input.discountValue ?? 0,
        discountAmount: cart.discountAmount,
        taxAmount: cart.taxAmount,
        shippingAmount: cart.shippingAmount,
        total: cart.total,
        amountPaid,
        amountDue,
        changeGiven,
        payments,
        paymentStatus,
        notes: input.notes,
        internalNotes: input.internalNotes,
        saleDate: input.saleDate ?? new Date(),
        dueDate: input.dueDate,
        purchaseOrderNumber: input.purchaseOrderNumber,
        currency: input.currency ?? "NGN",
        cashRegisterId: input.cashRegisterId,
        shiftId: input.shiftId,
        tags: input.tags ?? [],
        servedBy: userId,
        createdBy: userId,
        tenantId,
      });

      // Deduct stock for each item (only for completed/confirmed sales, not quotations)
      // We do this AFTER sale creation - if any fails, we'll log but not rollback
      if (status !== "draft") {
        const stockErrors: Error[] = [];
        
        for (const item of cart.items) {
          try {
            const product = productMap.get(item.productId.toString())!;
            if (product.isTrackingStock) {
              await stockService.adjustStock(
                {
                  productId: item.productId.toString(),
                  variantId: item.variantId?.toString(),
                  warehouseId: input.warehouseId,
                  quantity: item.quantity,
                  type: "sale",
                  costPrice: item.costPrice,
                  referenceType: "sale",
                  referenceId: sale._id.toString(),
                  referenceNumber: orderNumber,
                },
                tenantId,
                userId,
              );
            }
            
            // Update product sale totals
            await Product.findByIdAndUpdate(
              item.productId,
              {
                $inc: { totalSold: item.quantity, totalRevenue: item.total },
              }
            );
          } catch (error) {
            stockErrors.push(error as Error);
            logger.error(`Failed to update stock for product ${item.productId}:`, error);
          }
        }

        // If stock updates failed, log but don't throw - sale already created
        if (stockErrors.length > 0) {
          logger.error(`Stock updates failed for sale ${orderNumber}:`, stockErrors);
          // You might want to create a background job to retry these
        }
      }

      // Update customer stats (best effort - don't fail sale if this fails)
      if (input.customerId && status === "completed") {
        try {
          await Customer.findByIdAndUpdate(
            input.customerId,
            {
              $inc: { totalPurchases: 1, totalSpent: cart.total },
              $set: { lastPurchaseAt: new Date() },
            }
          );
        } catch (error) {
          logger.error(`Failed to update customer stats for ${input.customerId}:`, error);
        }
      }

      // Handle credit sale — add to customer credit balance
      if (type === "credit_sale" && input.customerId && amountDue > 0) {
        try {
          const customer = await Customer.findById(input.customerId);
          if (
            customer &&
            customer.creditBalance + amountDue > customer.creditLimit
          ) {
            // Log but don't throw - sale already created
            logger.error(
              `Credit limit exceeded for ${customer.name}. Limit: ${customer.creditLimit}, Current balance: ${customer.creditBalance}, New charge: ${amountDue}`
            );
          } else {
            await Customer.findByIdAndUpdate(
              input.customerId,
              { $inc: { creditBalance: amountDue } }
            );
          }
        } catch (error) {
          logger.error(`Failed to update credit balance for ${input.customerId}:`, error);
        }
      }

      // Invalidate dashboard cache
      await deleteCache(`sales:stats:${tenantId}`, CachePrefix.DASHBOARD);

      // Real-time notification
      emitToTenant(tenantId, "new_sale", {
        saleId: sale._id,
        orderNumber: sale.orderNumber,
        total: sale.total,
        servedBy: userId,
      });

      logger.info(
        `Sale created: ${orderNumber} total=${cart.total} by=${userId}`,
      );

      return Sale.findById(sale._id)
        .populate("customerId", "name phone email")
        .populate("warehouseId", "name code")
        .populate("servedBy", "name") as Promise<ISale>;
    } catch (err) {
      logger.error(`Failed to create sale:`, err);
      throw err;
    }
  }

  // ── Get sales list ─────────────────────────────────────────────────────────
  async getSales(
    query: PaginationQuery & {
      type?: string;
      status?: string;
      paymentStatus?: string;
      customerId?: string;
      warehouseId?: string;
      servedBy?: string;
      from?: string;
      to?: string;
      minTotal?: string;
      maxTotal?: string;
    },
    tenantId: string,
  ): Promise<PaginatedResult<ISale>> {
    const { page, limit, skip, sort } = parsePagination(query, "saleDate");
    const filter: Record<string, unknown> = { tenantId };

    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.servedBy) filter.servedBy = query.servedBy;

    if (query.minTotal || query.maxTotal) {
      const tf: Record<string, number> = {};
      if (query.minTotal) tf.$gte = parseFloat(query.minTotal);
      if (query.maxTotal) tf.$lte = parseFloat(query.maxTotal);
      filter.total = tf;
    }

    if (query.from || query.to) {
      const dr = buildDateRangeQuery(query.from, query.to);
      if (dr.createdAt) filter.saleDate = dr.createdAt;
    }

    if (query.search) {
      Object.assign(
        filter,
        buildSearchQuery(query.search, [
          "orderNumber",
          "customerName",
          "customerPhone",
          "invoiceNumber",
        ]),
      );
    }

    const [data, total] = await Promise.all([
      Sale.find(filter)
        .populate("customerId", "name phone customerNumber")
        .populate("warehouseId", "name code")
        .populate("servedBy", "name")
        .sort({ saleDate: -1, ...sort })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(filter),
    ]);

    return {
      data: data as unknown as ISale[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Get single sale ────────────────────────────────────────────────────────
  async getSaleById(id: string, tenantId: string): Promise<ISale> {
    const sale = await Sale.findOne({ _id: id, tenantId })
      .populate(
        "customerId",
        "name phone email customerNumber type creditLimit creditBalance",
      )
      .populate("warehouseId", "name code city")
      .populate("servedBy", "name email")
      .populate("createdBy", "name")
      .populate("originalSaleId", "orderNumber");
    if (!sale) throw new NotFoundError("Sale");
    return sale;
  }

  // ── Get sale by order number ───────────────────────────────────────────────
  async getSaleByOrderNumber(
    orderNumber: string,
    tenantId: string,
  ): Promise<ISale> {
    const sale = await Sale.findOne({ orderNumber, tenantId })
      .populate("customerId", "name phone")
      .populate("warehouseId", "name code")
      .populate("servedBy", "name");
    if (!sale) throw new NotFoundError("Sale");
    return sale;
  }

  // ── Add payment to existing sale ───────────────────────────────────────────
  async addPayment(
    saleId: string,
    paymentData: {
      method: ISalePayment["method"];
      amount: number;
      reference?: string;
      provider?: string;
      notes?: string;
    },
    tenantId: string,
    userId: string,
  ): Promise<ISale> {
    const sale = await Sale.findOne({ _id: saleId, tenantId });
    if (!sale) throw new NotFoundError("Sale");

    if (["cancelled", "refunded"].includes(sale.status)) {
      throw new BadRequestError(`Cannot add payment to a ${sale.status} sale`);
    }

    const payment: ISalePayment = {
      method: paymentData.method,
      amount: paymentData.amount,
      reference: paymentData.reference,
      provider: paymentData.provider,
      notes: paymentData.notes,
      status: "completed",
      paidAt: new Date(),
    } as ISalePayment;

    sale.payments.push(payment);
    const newAmountPaid = sale.payments.reduce(
      (s, p) => s + (p.status === "completed" ? p.amount : 0),
      0,
    );
    const newAmountDue = Math.max(0, sale.total - newAmountPaid);
    const newChange = Math.max(0, newAmountPaid - sale.total);
    const newStatus = calcPaymentStatus(sale.total, newAmountPaid);

    sale.amountPaid = newAmountPaid;
    sale.amountDue = newAmountDue;
    sale.changeGiven = newChange;
    sale.paymentStatus = newStatus;

    // Auto-complete confirmed sales once fully paid
    if (newStatus === "paid" && sale.status === "confirmed") {
      sale.status = "completed";
      sale.completedAt = new Date();
    }

    // Reduce credit balance if credit payment
    if (paymentData.method === "credit" && sale.customerId) {
      try {
        await Customer.findByIdAndUpdate(sale.customerId, {
          $inc: { creditBalance: -paymentData.amount },
        });
      } catch (error) {
        logger.error(`Failed to update credit balance for customer ${sale.customerId}:`, error);
      }
    }

    await sale.save();
    logger.info(
      `Payment added to ${sale.orderNumber}: ${paymentData.method} ${paymentData.amount}`,
    );
    return sale;
  }

  // ── Cancel sale ────────────────────────────────────────────────────────────
  async cancelSale(
    saleId: string,
    reason: string,
    tenantId: string,
    userId: string,
  ): Promise<ISale> {
    try {
      const sale = await Sale.findOne({ _id: saleId, tenantId });
      if (!sale) throw new NotFoundError("Sale");

      if (["cancelled", "refunded"].includes(sale.status)) {
        throw new BadRequestError(`Sale is already ${sale.status}`);
      }

      // Return stock for completed/confirmed sales
      if (sale.status !== "draft") {
        const stockErrors: Error[] = [];
        
        for (const item of sale.items) {
          try {
            const product = await Product.findById(item.productId);
            if (product?.isTrackingStock) {
              await stockService.adjustStock(
                {
                  productId: item.productId.toString(),
                  warehouseId: sale.warehouseId.toString(),
                  quantity: item.quantity - item.returnedQuantity,
                  type: "sale_return",
                  referenceType: "sale",
                  referenceId: sale._id.toString(),
                  referenceNumber: sale.orderNumber,
                  notes: `Sale cancelled: ${reason}`,
                },
                tenantId,
                userId,
              );
            }
            
            // Reverse product totals
            await Product.findByIdAndUpdate(
              item.productId,
              {
                $inc: { totalSold: -item.quantity, totalRevenue: -item.total },
              }
            );
          } catch (error) {
            stockErrors.push(error as Error);
            logger.error(`Failed to reverse stock for product ${item.productId}:`, error);
          }
        }

        if (stockErrors.length > 0) {
          logger.error(`Stock reversal errors for cancelled sale ${sale.orderNumber}:`, stockErrors);
        }
      }

      // Reverse customer credit
      if (
        sale.type === "credit_sale" &&
        sale.customerId &&
        sale.amountDue > 0
      ) {
        try {
          await Customer.findByIdAndUpdate(
            sale.customerId,
            { $inc: { creditBalance: -sale.amountDue } }
          );
        } catch (error) {
          logger.error(`Failed to reverse credit for customer ${sale.customerId}:`, error);
        }
      }

      await Sale.findByIdAndUpdate(
        saleId,
        {
          status: "cancelled",
          internalNotes:
            `${sale.internalNotes ?? ""}\nCancelled by ${userId}: ${reason}`.trim(),
          updatedBy: userId,
        }
      );

      logger.info(`Sale cancelled: ${sale.orderNumber} by ${userId}`);
      return Sale.findById(saleId) as Promise<ISale>;
    } catch (err) {
      logger.error(`Failed to cancel sale ${saleId}:`, err);
      throw err;
    }
  }

  // ── Process return ─────────────────────────────────────────────────────────
  async processReturn(
    originalSaleId: string,
    input: {
      reason: string;
      items: Array<{
        saleItemId: string;
        returnQuantity: number;
        restockToWarehouse?: boolean;
      }>;
      refundMethod: "cash" | "card" | "transfer" | "wallet" | "store_credit";
      refundNotes?: string;
    },
    tenantId: string,
    userId: string,
  ): Promise<ISale> {
    try {
      const originalSale = await Sale.findOne({
        _id: originalSaleId,
        tenantId,
      });
      if (!originalSale) throw new NotFoundError("Original sale");

      if (["cancelled", "refunded"].includes(originalSale.status)) {
        throw new BadRequestError(`Sale is already ${originalSale.status}`);
      }

      // Validate return items and build return order
      let returnTotal = 0;
      const returnItems: Omit<ISaleItem, "_id">[] = [];

      for (const ret of input.items) {
        const origItem = originalSale.items.find(
          (i) => i._id?.toString() === ret.saleItemId,
        );
        if (!origItem) throw new NotFoundError(`Sale item ${ret.saleItemId}`);

        const maxReturnable = origItem.quantity - origItem.returnedQuantity;
        if (ret.returnQuantity > maxReturnable) {
          throw new BadRequestError(
            `Return qty (${ret.returnQuantity}) exceeds returnable qty (${maxReturnable}) for ${origItem.name}`,
          );
        }

        const itemReturnTotal = parseFloat(
          (origItem.unitPrice * ret.returnQuantity).toFixed(2),
        );
        returnTotal += itemReturnTotal;

        returnItems.push({
          productId: origItem.productId,
          variantId: origItem.variantId,
          name: origItem.name,
          sku: origItem.sku,
          quantity: ret.returnQuantity,
          unitPrice: origItem.unitPrice,
          costPrice: origItem.costPrice,
          discountPercent: origItem.discountPercent,
          discountAmount: parseFloat(
            (
              (origItem.discountAmount / origItem.quantity) *
              ret.returnQuantity
            ).toFixed(2),
          ),
          taxRate: origItem.taxRate,
          taxAmount: parseFloat(
            (
              (origItem.taxAmount / origItem.quantity) *
              ret.returnQuantity
            ).toFixed(2),
          ),
          subtotal: origItem.unitPrice * ret.returnQuantity,
          total: itemReturnTotal,
          returnedQuantity: 0,
        });
      }

      // Create the return sale document (FIRST STEP)
      const returnOrderNumber = await generateOrderNumber(tenantId, "pos");
      const returnSale = await Sale.create({
        orderNumber: returnOrderNumber,
        type: "pos",
        status: "completed",
        isReturn: true,
        originalSaleId: originalSaleId,
        returnReason: input.reason,
        customerId: originalSale.customerId,
        customerName: originalSale.customerName,
        customerPhone: originalSale.customerPhone,
        warehouseId: originalSale.warehouseId,
        items: returnItems,
        subtotal: -returnTotal,
        discountType: "none",
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        shippingAmount: 0,
        total: -returnTotal,
        amountPaid: -returnTotal,
        amountDue: 0,
        changeGiven: 0,
        payments: [
          {
            method:
              input.refundMethod === "store_credit"
                ? "wallet"
                : input.refundMethod,
            amount: -returnTotal,
            status: "refunded",
            paidAt: new Date(),
            notes: input.refundNotes,
          },
        ],
        paymentStatus: "refunded",
        notes: `Return for ${originalSale.orderNumber}: ${input.reason}`,
        currency: originalSale.currency,
        saleDate: new Date(),
        servedBy: userId,
        createdBy: userId,
        tenantId,
      });

      // Update original sale returned quantities
      for (const ret of input.items) {
        await Sale.updateOne(
          { _id: originalSaleId, "items._id": ret.saleItemId },
          { $inc: { "items.$.returnedQuantity": ret.returnQuantity } }
        );
      }

      // Determine if fully or partially returned
      const allReturned = input.items.every((ret) => {
        const origItem = originalSale.items.find(
          (i) => i._id?.toString() === ret.saleItemId,
        )!;
        return ret.returnQuantity >= origItem.quantity;
      });

      await Sale.findByIdAndUpdate(
        originalSaleId,
        {
          status: allReturned ? "refunded" : "partial_refund",
          updatedBy: userId,
        }
      );

      // Restock items (best effort - don't fail return if this fails)
      const restockErrors: Error[] = [];
      for (const ret of input.items) {
        try {
          const origItem = originalSale.items.find(
            (i) => i._id?.toString() === ret.saleItemId,
          )!;
          const shouldRestock =
            input.items.find((r) => r.saleItemId === ret.saleItemId)
              ?.restockToWarehouse ?? true;
          if (shouldRestock) {
            const product = await Product.findById(origItem.productId);
            if (product?.isTrackingStock) {
              await stockService.adjustStock(
                {
                  productId: origItem.productId.toString(),
                  warehouseId: originalSale.warehouseId.toString(),
                  quantity: ret.returnQuantity,
                  type: "sale_return",
                  costPrice: origItem.costPrice,
                  referenceType: "return",
                  referenceId: returnSale._id.toString(),
                  referenceNumber: returnOrderNumber,
                  notes: input.reason,
                },
                tenantId,
                userId,
              );
            }
          }
          
          // Update product totals
          await Product.findByIdAndUpdate(
            origItem.productId,
            {
              $inc: {
                totalSold: -ret.returnQuantity,
                totalRevenue: -(origItem.unitPrice * ret.returnQuantity),
              },
            }
          );
        } catch (error) {
          restockErrors.push(error as Error);
          logger.error(`Failed to restock product during return:`, error);
        }
      }

      if (restockErrors.length > 0) {
        logger.error(`Restock errors for return ${returnOrderNumber}:`, restockErrors);
      }

      logger.info(
        `Return processed: ${returnOrderNumber} for ${originalSale.orderNumber} total=-${returnTotal}`,
      );
      emitToTenant(tenantId, "sale_return", {
        returnId: returnSale._id,
        originalId: originalSaleId,
        returnTotal,
      });

      return Sale.findById(returnSale._id).populate(
        "warehouseId",
        "name code",
      ) as Promise<ISale>;
    } catch (err) {
      logger.error(`Failed to process return:`, err);
      throw err;
    }
  }

  // ── Daily closing / Z-report ───────────────────────────────────────────────
  async getDailyClosing(
    input: {
      warehouseId: string;
      cashRegisterId?: string;
      expectedCash: number;
      actualCash: number;
      notes?: string;
    },
    tenantId: string,
    userId: string,
  ) {
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const end = new Date(start.getTime() + 86_400_000);

    const filter: Record<string, unknown> = {
      tenantId,
      warehouseId: input.warehouseId,
      saleDate: { $gte: start, $lt: end },
      status: { $nin: ["draft", "cancelled"] },
    };
    if (input.cashRegisterId) filter.cashRegisterId = input.cashRegisterId;

    const [salesAgg, returnsAgg, paymentBreakdown] = await Promise.all([
      Sale.aggregate([
        { $match: { ...filter, isReturn: false } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            subtotal: { $sum: "$subtotal" },
            discount: { $sum: "$discountAmount" },
            tax: { $sum: "$taxAmount" },
            total: { $sum: "$total" },
            paid: { $sum: "$amountPaid" },
            due: { $sum: "$amountDue" },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { ...filter, isReturn: true } },
        {
          $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } },
        },
      ]),
      Sale.aggregate([
        { $match: { ...filter, isReturn: false } },
        { $unwind: "$payments" },
        { $match: { "payments.status": "completed" } },
        {
          $group: {
            _id: "$payments.method",
            total: { $sum: "$payments.amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const sales = salesAgg[0] ?? {
      count: 0,
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paid: 0,
      due: 0,
    };
    const returns = returnsAgg[0] ?? { count: 0, total: 0 };
    const cashVariance = input.actualCash - input.expectedCash;

    const report = {
      generatedAt: new Date(),
      warehouseId: input.warehouseId,
      cashRegisterId: input.cashRegisterId,
      period: { start, end },
      sales: {
        count: sales.count,
        subtotal: sales.subtotal,
        discount: sales.discount,
        tax: sales.tax,
        total: sales.total,
      },
      collections: { total: sales.paid, outstanding: sales.due },
      returns: { count: returns.count, total: Math.abs(returns.total ?? 0) },
      netTotal: sales.total + (returns.total ?? 0),
      paymentBreakdown,
      cashCount: {
        expected: input.expectedCash,
        actual: input.actualCash,
        variance: cashVariance,
        isBalanced: Math.abs(cashVariance) < 1,
      },
      notes: input.notes,
      closedBy: userId,
    };

    logger.info(
      `Daily closing generated for warehouse ${input.warehouseId} by ${userId}`,
    );
    return report;
  }

  // ── Sales statistics ───────────────────────────────────────────────────────
  async getSalesStats(
    query: {
      from?: string;
      to?: string;
      warehouseId?: string;
      groupBy?: "day" | "week" | "month";
    },
    tenantId: string,
  ) {
    return getOrSet(
      `sales:stats:${tenantId}:${JSON.stringify(query)}`,
      async () => {
        const match: Record<string, unknown> = {
          tenantId,
          status: { $nin: ["draft", "cancelled"] },
          isReturn: false,
        };
        if (query.warehouseId)
          match.warehouseId = new Types.ObjectId(query.warehouseId);
        Object.assign(
          match,
          buildDateRangeQuery(query.from, query.to, "saleDate"),
        );

        const [
          overview,
          byPaymentMethod,
          topProducts,
          topCustomers,
          salesTrend,
        ] = await Promise.all([
          // Overall summary
          Sale.aggregate([
            { $match: match },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$total" },
                totalDiscount: { $sum: "$discountAmount" },
                totalTax: { $sum: "$taxAmount" },
                avgOrderValue: { $avg: "$total" },
                totalPaid: { $sum: "$amountPaid" },
                totalDue: { $sum: "$amountDue" },
              },
            },
          ]),
          // Payment method breakdown
          Sale.aggregate([
            { $match: match },
            { $unwind: "$payments" },
            { $match: { "payments.status": "completed" } },
            {
              $group: {
                _id: "$payments.method",
                total: { $sum: "$payments.amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ]),
          // Top selling products
          Sale.aggregate([
            { $match: match },
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.productId",
                name: { $first: "$items.name" },
                sku: { $first: "$items.sku" },
                qty: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.total" },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
          ]),
          // Top customers
          Sale.aggregate([
            { $match: { ...match, customerId: { $exists: true, $ne: null } } },
            {
              $group: {
                _id: "$customerId",
                customerName: { $first: "$customerName" },
                orders: { $sum: 1 },
                total: { $sum: "$total" },
              },
            },
            { $sort: { total: -1 } },
            { $limit: 10 },
          ]),
          // Sales trend
          Sale.aggregate([
            { $match: match },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: query.groupBy === "month" ? "%Y-%m" : "%Y-%m-%d",
                    date: "$saleDate",
                  },
                },
                count: { $sum: 1 },
                revenue: { $sum: "$total" },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ]);

        return {
          overview: overview[0] ?? {
            totalOrders: 0,
            totalRevenue: 0,
            totalDiscount: 0,
            totalTax: 0,
            avgOrderValue: 0,
            totalPaid: 0,
            totalDue: 0,
          },
          byPaymentMethod,
          topProducts,
          topCustomers,
          salesTrend,
        };
      },
      { prefix: CachePrefix.DASHBOARD, ttl: 300 },
    );
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  async getCustomers(
    query: PaginationQuery & { type?: string; isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<ICustomer>> {
    const { page, limit, skip, sort } = parsePagination(query, "name");
    const filter: Record<string, unknown> = { tenantId };
    if (query.type) filter.type = query.type;
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.search)
      Object.assign(
        filter,
        buildSearchQuery(query.search, [
          "name",
          "phone",
          "email",
          "customerNumber",
        ]),
      );

    const [data, total] = await Promise.all([
      Customer.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);
    return {
      data: data as ICustomer[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getCustomerById(id: string, tenantId: string): Promise<ICustomer> {
    const c = await Customer.findOne({ _id: id, tenantId });
    if (!c) throw new NotFoundError("Customer");
    return c;
  }

  async createCustomer(
    input: Partial<ICustomer>,
    tenantId: string,
    userId: string,
  ): Promise<ICustomer> {
    if (input.phone) {
      const exists = await Customer.findOne({ phone: input.phone, tenantId });
      if (exists)
        throw new ConflictError(
          `Customer with phone "${input.phone}" already exists`,
        );
    }
    return Customer.create({
      ...input,
      customerNumber: generateCustomerNumber(tenantId),
      tenantId,
      createdBy: userId,
    });
  }

  async updateCustomer(
    id: string,
    input: Partial<ICustomer>,
    tenantId: string,
  ): Promise<ICustomer> {
    const customer = await Customer.findOneAndUpdate(
      { _id: id, tenantId },
      input,
      { new: true, runValidators: true },
    );
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  }

  async getCustomerSales(
    customerId: string,
    tenantId: string,
    limit = 20,
  ): Promise<ISale[]> {
    return Sale.find({ customerId, tenantId })
      .sort({ saleDate: -1 })
      .limit(limit)
      .select("orderNumber type status total paymentStatus saleDate")
      .lean() as Promise<ISale[]>;
  }

  async adjustCustomerCredit(
    id: string,
    amount: number,
    notes: string,
    tenantId: string,
  ): Promise<ICustomer> {
    const customer = await Customer.findOne({ _id: id, tenantId });
    if (!customer) throw new NotFoundError("Customer");
    const newBalance = customer.creditBalance + amount;
    if (newBalance < 0)
      throw new BadRequestError(
        "Credit adjustment would result in negative balance",
      );
    if (newBalance > customer.creditLimit)
      throw new BadRequestError(
        `Exceeds credit limit of ${customer.creditLimit}`,
      );
    return Customer.findByIdAndUpdate(
      id,
      { creditBalance: newBalance },
      { new: true },
    ) as Promise<ICustomer>;
  }
}

export const saleService = new SaleService();


// import mongoose, { Types } from "mongoose";
// import Sale, { ISale, ISaleItem, ISalePayment } from "./sale.model";
// import Customer, { ICustomer } from "./customer.model";
// import Product from "../products/product.model";
// import { stockService } from "../stock/stock.service";
// import Warehouse from "../warehouses/warehouse.model";
// import {
//   parsePagination,
//   buildPaginationMeta,
//   buildSearchQuery,
//   buildDateRangeQuery,
// } from "../../shared/utils/pagination";
// import { getOrSet, deleteCache, CachePrefix } from "../../shared/utils/cache";
// import {
//   NotFoundError,
//   BadRequestError,
//   ConflictError,
// } from "../../shared/utils/errors";
// import { PaginationQuery, PaginatedResult } from "../../shared/types";
// import { emitToTenant } from "../../server";
// import logger from "../../config/logger";

// // ── Order number generator ───────────────────────────────────────────────────
// async function generateOrderNumber(
//   tenantId: string,
//   type: string,
// ): Promise<string> {
//   const prefix =
//     type === "invoice" ? "INV" : type === "quotation" ? "QUO" : "SO";
//   const d = new Date();
//   const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
//   const count = await Sale.countDocuments({
//     tenantId,
//     type,
//     createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
//   });
//   return `${prefix}-${yyyymm}-${String(count + 1).padStart(4, "0")}`;
// }

// function generateCustomerNumber(tenantId: string): string {
//   return `CUST-${Date.now().toString(36).toUpperCase()}`;
// }

// // ── Cart calculations ────────────────────────────────────────────────────────
// interface CartItemInput {
//   productId: string;
//   variantId?: string;
//   quantity: number;
//   unitPrice: number;
//   costPrice: number;
//   discountPercent?: number;
//   discountAmount?: number;
//   taxRate?: number;
//   notes?: string;
//   name?: string;
//   sku?: string;
// }

// interface CartInput {
//   items: CartItemInput[];
//   discountType?: "none" | "percent" | "fixed";
//   discountValue?: number;
//   shippingAmount?: number;
// }

// interface CartResult {
//   items: Omit<ISaleItem, "_id">[];
//   subtotal: number;
//   discountAmount: number;
//   taxAmount: number;
//   shippingAmount: number;
//   total: number;
// }

// function calculateCart(
//   input: CartInput,
//   products: Map<
//     string,
//     { name: string; sku: string; costPrice: number; tax: { taxRate?: number } }
//   >,
// ): CartResult {
//   let subtotal = 0;
//   let taxAmount = 0;
//   let totalDiscount = 0;

//   const items: Omit<ISaleItem, "_id">[] = input.items.map((i) => {
//     const prod = products.get(i.productId);
//     const name = i.name || prod?.name || "Unknown";
//     const sku = i.sku || prod?.sku || "";

//     const itemSubtotal = i.unitPrice * i.quantity;
//     const itemDiscPercent = i.discountPercent ?? 0;
//     const itemDiscAmount =
//       i.discountAmount ??
//       parseFloat(((itemSubtotal * itemDiscPercent) / 100).toFixed(2));
//     const taxRate = i.taxRate ?? prod?.tax?.taxRate ?? 0;
//     const taxableAmount = itemSubtotal - itemDiscAmount;
//     const itemTax = parseFloat(((taxableAmount * taxRate) / 100).toFixed(2));
//     const itemTotal = parseFloat((taxableAmount + itemTax).toFixed(2));

//     subtotal += itemSubtotal;
//     taxAmount += itemTax;
//     totalDiscount += itemDiscAmount;

//     return {
//       productId: new Types.ObjectId(i.productId) as unknown as Types.ObjectId,
//       variantId: i.variantId
//         ? (new Types.ObjectId(i.variantId) as unknown as Types.ObjectId)
//         : undefined,
//       name,
//       sku,
//       quantity: i.quantity,
//       unitPrice: i.unitPrice,
//       costPrice: i.costPrice || prod?.costPrice || 0,
//       discountPercent: itemDiscPercent,
//       discountAmount: itemDiscAmount,
//       taxRate,
//       taxAmount: itemTax,
//       subtotal: itemSubtotal,
//       total: itemTotal,
//       notes: i.notes,
//       returnedQuantity: 0,
//     };
//   });

//   // Order-level discount
//   const shipping = input.shippingAmount ?? 0;
//   let orderDiscount = 0;
//   if (input.discountType === "percent") {
//     orderDiscount = parseFloat(
//       (((subtotal - totalDiscount) * (input.discountValue ?? 0)) / 100).toFixed(
//         2,
//       ),
//     );
//   } else if (input.discountType === "fixed") {
//     orderDiscount = input.discountValue ?? 0;
//   }

//   const grandTotal = parseFloat(
//     (subtotal - totalDiscount - orderDiscount + taxAmount + shipping).toFixed(
//       2,
//     ),
//   );

//   return {
//     items,
//     subtotal,
//     discountAmount: totalDiscount + orderDiscount,
//     taxAmount,
//     shippingAmount: shipping,
//     total: Math.max(0, grandTotal),
//   };
// }

// // ── Payment status helper ────────────────────────────────────────────────────
// function calcPaymentStatus(
//   total: number,
//   amountPaid: number,
// ): ISale["paymentStatus"] {
//   if (amountPaid <= 0) return "unpaid";
//   if (amountPaid < total - 0.01) return "partial";
//   if (Math.abs(amountPaid - total) < 0.01) return "paid";
//   return "overpaid";
// }

// // ── Main service ─────────────────────────────────────────────────────────────
// export class SaleService {
//   // ── Create sale / POS order ────────────────────────────────────────────────
//   async createSale(
//     input: {
//       type?: ISale["type"];
//       customerId?: string;
//       customerName?: string;
//       customerPhone?: string;
//       customerEmail?: string;
//       warehouseId: string;
//       items: CartItemInput[];
//       discountType?: CartInput["discountType"];
//       discountValue?: number;
//       shippingAmount?: number;
//       payments?: Array<{
//         method: ISalePayment["method"];
//         amount: number;
//         reference?: string;
//         provider?: string;
//         notes?: string;
//       }>;
//       notes?: string;
//       internalNotes?: string;
//       saleDate?: Date;
//       dueDate?: Date;
//       purchaseOrderNumber?: string;
//       currency?: string;
//       cashRegisterId?: string;
//       shiftId?: string;
//       tags?: string[];
//     },
//     tenantId: string,
//     userId: string,
//   ): Promise<ISale> {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const type = input.type ?? "pos";

//       // Validate warehouse
//       const warehouse = await Warehouse.findOne({
//         _id: input.warehouseId,
//         tenantId,
//       });
//       if (!warehouse) throw new NotFoundError("Warehouse");

//       // Load products for cart calculation
//       const productIds = [...new Set(input.items.map((i) => i.productId))];
//       const products = await Product.find({
//         _id: { $in: productIds },
//         tenantId,
//       });
//       const productMap = new Map(products.map((p) => [p._id.toString(), p]));

//       for (const item of input.items) {
//         if (!productMap.has(item.productId))
//           throw new NotFoundError(`Product ${item.productId}`);
//       }

//       // Calculate cart totals
//       const cart = calculateCart(
//         {
//           items: input.items,
//           discountType: input.discountType,
//           discountValue: input.discountValue,
//           shippingAmount: input.shippingAmount,
//         },
//         new Map(
//           products.map((p) => [
//             p._id.toString(),
//             { name: p.name, sku: p.sku, costPrice: p.costPrice, tax: p.tax },
//           ]),
//         ),
//       );

//       // Calculate payments
//       const payments: Omit<ISalePayment, "_id">[] = (input.payments ?? []).map(
//         (p) => ({
//           method: p.method,
//           amount: p.amount,
//           reference: p.reference,
//           provider: p.provider,
//           notes: p.notes,
//           status: "completed" as const,
//           paidAt: new Date(),
//         }),
//       );
//       const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
//       const amountDue = Math.max(0, cart.total - amountPaid);
//       const changeGiven = Math.max(0, amountPaid - cart.total);
//       const paymentStatus = calcPaymentStatus(cart.total, amountPaid);

//       // Generate order number
//       const orderNumber = await generateOrderNumber(tenantId, type);

//       // Determine sale status
//       let status: ISale["status"] = "completed";
//       if (type === "quotation") status = "draft";
//       else if (type === "invoice" && paymentStatus !== "paid")
//         status = "confirmed";
//       else if (type === "credit_sale") status = "confirmed";

//       // Create sale
//       const sale = await Sale.create(
//         [
//           {
//             orderNumber,
//             type,
//             status,
//             customerId: input.customerId,
//             customerName: input.customerName,
//             customerPhone: input.customerPhone,
//             customerEmail: input.customerEmail,
//             warehouseId: input.warehouseId,
//             items: cart.items,
//             subtotal: cart.subtotal,
//             discountType: input.discountType ?? "none",
//             discountValue: input.discountValue ?? 0,
//             discountAmount: cart.discountAmount,
//             taxAmount: cart.taxAmount,
//             shippingAmount: cart.shippingAmount,
//             total: cart.total,
//             amountPaid,
//             amountDue,
//             changeGiven,
//             payments,
//             paymentStatus,
//             notes: input.notes,
//             internalNotes: input.internalNotes,
//             saleDate: input.saleDate ?? new Date(),
//             dueDate: input.dueDate,
//             purchaseOrderNumber: input.purchaseOrderNumber,
//             currency: input.currency ?? "NGN",
//             cashRegisterId: input.cashRegisterId,
//             shiftId: input.shiftId,
//             tags: input.tags ?? [],
//             servedBy: userId,
//             createdBy: userId,
//             tenantId,
//           },
//         ],
//         { session },
//       ).then((docs) => docs[0]);

//       // Deduct stock for each item (only for completed/confirmed sales, not quotations)
//       if (status !== "draft") {
//         for (const item of cart.items) {
//           const product = productMap.get(item.productId.toString())!;
//           if (product.isTrackingStock) {
//             await stockService.adjustStock(
//               {
//                 productId: item.productId.toString(),
//                 variantId: item.variantId?.toString(),
//                 warehouseId: input.warehouseId,
//                 quantity: item.quantity,
//                 type: "sale",
//                 costPrice: item.costPrice,
//                 referenceType: "sale",
//                 referenceId: sale._id.toString(),
//                 referenceNumber: orderNumber,
//               },
//               tenantId,
//               userId,
//             );
//           }
//           // Update product sale totals
//           await Product.findByIdAndUpdate(
//             item.productId,
//             {
//               $inc: { totalSold: item.quantity, totalRevenue: item.total },
//             },
//             { session },
//           );
//         }
//       }

//       // Update customer stats
//       if (input.customerId && status === "completed") {
//         await Customer.findByIdAndUpdate(
//           input.customerId,
//           {
//             $inc: { totalPurchases: 1, totalSpent: cart.total },
//             $set: { lastPurchaseAt: new Date() },
//           },
//           { session },
//         );
//       }

//       // Handle credit sale — add to customer credit balance
//       if (type === "credit_sale" && input.customerId && amountDue > 0) {
//         const customer = await Customer.findById(input.customerId).session(
//           session,
//         );
//         if (
//           customer &&
//           customer.creditBalance + amountDue > customer.creditLimit
//         ) {
//           throw new BadRequestError(
//             `Credit limit exceeded for ${customer.name}. Limit: ${customer.creditLimit}, Current balance: ${customer.creditBalance}, New charge: ${amountDue}`,
//           );
//         }
//         await Customer.findByIdAndUpdate(
//           input.customerId,
//           { $inc: { creditBalance: amountDue } },
//           { session },
//         );
//       }

//       await session.commitTransaction();

//       // Invalidate dashboard cache
//       await deleteCache(`sales:stats:${tenantId}`, CachePrefix.DASHBOARD);

//       // Real-time notification
//       emitToTenant(tenantId, "new_sale", {
//         saleId: sale._id,
//         orderNumber: sale.orderNumber,
//         total: sale.total,
//         servedBy: userId,
//       });

//       logger.info(
//         `Sale created: ${orderNumber} total=${cart.total} by=${userId}`,
//       );

//       return Sale.findById(sale._id)
//         .populate("customerId", "name phone email")
//         .populate("warehouseId", "name code")
//         .populate("servedBy", "name") as Promise<ISale>;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       await session.endSession();
//     }
//   }

//   // ── Get sales list ─────────────────────────────────────────────────────────
//   async getSales(
//     query: PaginationQuery & {
//       type?: string;
//       status?: string;
//       paymentStatus?: string;
//       customerId?: string;
//       warehouseId?: string;
//       servedBy?: string;
//       from?: string;
//       to?: string;
//       minTotal?: string;
//       maxTotal?: string;
//     },
//     tenantId: string,
//   ): Promise<PaginatedResult<ISale>> {
//     const { page, limit, skip, sort } = parsePagination(query, "saleDate");
//     const filter: Record<string, unknown> = { tenantId };

//     if (query.type) filter.type = query.type;
//     if (query.status) filter.status = query.status;
//     if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
//     if (query.customerId) filter.customerId = query.customerId;
//     if (query.warehouseId) filter.warehouseId = query.warehouseId;
//     if (query.servedBy) filter.servedBy = query.servedBy;

//     if (query.minTotal || query.maxTotal) {
//       const tf: Record<string, number> = {};
//       if (query.minTotal) tf.$gte = parseFloat(query.minTotal);
//       if (query.maxTotal) tf.$lte = parseFloat(query.maxTotal);
//       filter.total = tf;
//     }

//     if (query.from || query.to) {
//       const dr = buildDateRangeQuery(query.from, query.to);
//       if (dr.createdAt) filter.saleDate = dr.createdAt;
//     }

//     if (query.search) {
//       Object.assign(
//         filter,
//         buildSearchQuery(query.search, [
//           "orderNumber",
//           "customerName",
//           "customerPhone",
//           "invoiceNumber",
//         ]),
//       );
//     }

//     const [data, total] = await Promise.all([
//       Sale.find(filter)
//         .populate("customerId", "name phone customerNumber")
//         .populate("warehouseId", "name code")
//         .populate("servedBy", "name")
//         .sort({ saleDate: -1, ...sort })
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//       Sale.countDocuments(filter),
//     ]);

//     return {
//       data: data as unknown as ISale[],
//       pagination: buildPaginationMeta(total, page, limit),
//     };
//   }

//   // ── Get single sale ────────────────────────────────────────────────────────
//   async getSaleById(id: string, tenantId: string): Promise<ISale> {
//     const sale = await Sale.findOne({ _id: id, tenantId })
//       .populate(
//         "customerId",
//         "name phone email customerNumber type creditLimit creditBalance",
//       )
//       .populate("warehouseId", "name code city")
//       .populate("servedBy", "name email")
//       .populate("createdBy", "name")
//       .populate("originalSaleId", "orderNumber");
//     if (!sale) throw new NotFoundError("Sale");
//     return sale;
//   }

//   // ── Get sale by order number ───────────────────────────────────────────────
//   async getSaleByOrderNumber(
//     orderNumber: string,
//     tenantId: string,
//   ): Promise<ISale> {
//     const sale = await Sale.findOne({ orderNumber, tenantId })
//       .populate("customerId", "name phone")
//       .populate("warehouseId", "name code")
//       .populate("servedBy", "name");
//     if (!sale) throw new NotFoundError("Sale");
//     return sale;
//   }

//   // ── Add payment to existing sale ───────────────────────────────────────────
//   async addPayment(
//     saleId: string,
//     paymentData: {
//       method: ISalePayment["method"];
//       amount: number;
//       reference?: string;
//       provider?: string;
//       notes?: string;
//     },
//     tenantId: string,
//     userId: string,
//   ): Promise<ISale> {
//     const sale = await Sale.findOne({ _id: saleId, tenantId });
//     if (!sale) throw new NotFoundError("Sale");

//     if (["cancelled", "refunded"].includes(sale.status)) {
//       throw new BadRequestError(`Cannot add payment to a ${sale.status} sale`);
//     }

//     const payment: ISalePayment = {
//       method: paymentData.method,
//       amount: paymentData.amount,
//       reference: paymentData.reference,
//       provider: paymentData.provider,
//       notes: paymentData.notes,
//       status: "completed",
//       paidAt: new Date(),
//     } as ISalePayment;

//     sale.payments.push(payment);
//     const newAmountPaid = sale.payments.reduce(
//       (s, p) => s + (p.status === "completed" ? p.amount : 0),
//       0,
//     );
//     const newAmountDue = Math.max(0, sale.total - newAmountPaid);
//     const newChange = Math.max(0, newAmountPaid - sale.total);
//     const newStatus = calcPaymentStatus(sale.total, newAmountPaid);

//     sale.amountPaid = newAmountPaid;
//     sale.amountDue = newAmountDue;
//     sale.changeGiven = newChange;
//     sale.paymentStatus = newStatus;

//     // Auto-complete confirmed sales once fully paid
//     if (newStatus === "paid" && sale.status === "confirmed") {
//       sale.status = "completed";
//       sale.completedAt = new Date();
//     }

//     // Reduce credit balance if credit payment
//     if (paymentData.method === "credit" && sale.customerId) {
//       await Customer.findByIdAndUpdate(sale.customerId, {
//         $inc: { creditBalance: -paymentData.amount },
//       });
//     }

//     await sale.save();
//     logger.info(
//       `Payment added to ${sale.orderNumber}: ${paymentData.method} ${paymentData.amount}`,
//     );
//     return sale;
//   }

//   // ── Cancel sale ────────────────────────────────────────────────────────────
//   async cancelSale(
//     saleId: string,
//     reason: string,
//     tenantId: string,
//     userId: string,
//   ): Promise<ISale> {
//     const session = await mongoose.startSession();
//     session.startTransaction();
//     try {
//       const sale = await Sale.findOne({ _id: saleId, tenantId }).session(
//         session,
//       );
//       if (!sale) throw new NotFoundError("Sale");

//       if (["cancelled", "refunded"].includes(sale.status)) {
//         throw new BadRequestError(`Sale is already ${sale.status}`);
//       }

//       // Return stock for completed/confirmed sales
//       if (sale.status !== "draft") {
//         for (const item of sale.items) {
//           const product = await Product.findById(item.productId);
//           if (product?.isTrackingStock) {
//             await stockService.adjustStock(
//               {
//                 productId: item.productId.toString(),
//                 warehouseId: sale.warehouseId.toString(),
//                 quantity: item.quantity - item.returnedQuantity,
//                 type: "sale_return",
//                 referenceType: "sale",
//                 referenceId: sale._id.toString(),
//                 referenceNumber: sale.orderNumber,
//                 notes: `Sale cancelled: ${reason}`,
//               },
//               tenantId,
//               userId,
//             );
//           }
//         }
//         // Reverse product totals
//         for (const item of sale.items) {
//           await Product.findByIdAndUpdate(
//             item.productId,
//             {
//               $inc: { totalSold: -item.quantity, totalRevenue: -item.total },
//             },
//             { session },
//           );
//         }
//       }

//       // Reverse customer credit
//       if (
//         sale.type === "credit_sale" &&
//         sale.customerId &&
//         sale.amountDue > 0
//       ) {
//         await Customer.findByIdAndUpdate(
//           sale.customerId,
//           { $inc: { creditBalance: -sale.amountDue } },
//           { session },
//         );
//       }

//       await Sale.findByIdAndUpdate(
//         saleId,
//         {
//           status: "cancelled",
//           internalNotes:
//             `${sale.internalNotes ?? ""}\nCancelled by ${userId}: ${reason}`.trim(),
//           updatedBy: userId,
//         },
//         { session },
//       );

//       await session.commitTransaction();

//       logger.info(`Sale cancelled: ${sale.orderNumber} by ${userId}`);
//       return Sale.findById(saleId) as Promise<ISale>;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       await session.endSession();
//     }
//   }

//   // ── Process return ─────────────────────────────────────────────────────────
//   async processReturn(
//     originalSaleId: string,
//     input: {
//       reason: string;
//       items: Array<{
//         saleItemId: string;
//         returnQuantity: number;
//         restockToWarehouse?: boolean;
//       }>;
//       refundMethod: "cash" | "card" | "transfer" | "wallet" | "store_credit";
//       refundNotes?: string;
//     },
//     tenantId: string,
//     userId: string,
//   ): Promise<ISale> {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const originalSale = await Sale.findOne({
//         _id: originalSaleId,
//         tenantId,
//       }).session(session);
//       if (!originalSale) throw new NotFoundError("Original sale");

//       if (["cancelled", "refunded"].includes(originalSale.status)) {
//         throw new BadRequestError(`Sale is already ${originalSale.status}`);
//       }

//       // Validate return items and build return order
//       let returnTotal = 0;
//       const returnItems: Omit<ISaleItem, "_id">[] = [];

//       for (const ret of input.items) {
//         const origItem = originalSale.items.find(
//           (i) => i._id?.toString() === ret.saleItemId,
//         );
//         if (!origItem) throw new NotFoundError(`Sale item ${ret.saleItemId}`);

//         const maxReturnable = origItem.quantity - origItem.returnedQuantity;
//         if (ret.returnQuantity > maxReturnable) {
//           throw new BadRequestError(
//             `Return qty (${ret.returnQuantity}) exceeds returnable qty (${maxReturnable}) for ${origItem.name}`,
//           );
//         }

//         const itemReturnTotal = parseFloat(
//           (origItem.unitPrice * ret.returnQuantity).toFixed(2),
//         );
//         returnTotal += itemReturnTotal;

//         returnItems.push({
//           productId: origItem.productId,
//           variantId: origItem.variantId,
//           name: origItem.name,
//           sku: origItem.sku,
//           quantity: ret.returnQuantity,
//           unitPrice: origItem.unitPrice,
//           costPrice: origItem.costPrice,
//           discountPercent: origItem.discountPercent,
//           discountAmount: parseFloat(
//             (
//               (origItem.discountAmount / origItem.quantity) *
//               ret.returnQuantity
//             ).toFixed(2),
//           ),
//           taxRate: origItem.taxRate,
//           taxAmount: parseFloat(
//             (
//               (origItem.taxAmount / origItem.quantity) *
//               ret.returnQuantity
//             ).toFixed(2),
//           ),
//           subtotal: origItem.unitPrice * ret.returnQuantity,
//           total: itemReturnTotal,
//           returnedQuantity: 0,
//         });
//       }

//       // Create the return sale document
//       const returnOrderNumber = await generateOrderNumber(tenantId, "pos");
//       const returnSale = await Sale.create(
//         [
//           {
//             orderNumber: returnOrderNumber,
//             type: "pos",
//             status: "completed",
//             isReturn: true,
//             originalSaleId: originalSaleId,
//             returnReason: input.reason,
//             customerId: originalSale.customerId,
//             customerName: originalSale.customerName,
//             customerPhone: originalSale.customerPhone,
//             warehouseId: originalSale.warehouseId,
//             items: returnItems,
//             subtotal: -returnTotal,
//             discountType: "none",
//             discountValue: 0,
//             discountAmount: 0,
//             taxAmount: 0,
//             shippingAmount: 0,
//             total: -returnTotal,
//             amountPaid: -returnTotal,
//             amountDue: 0,
//             changeGiven: 0,
//             payments: [
//               {
//                 method:
//                   input.refundMethod === "store_credit"
//                     ? "wallet"
//                     : input.refundMethod,
//                 amount: -returnTotal,
//                 status: "refunded",
//                 paidAt: new Date(),
//                 notes: input.refundNotes,
//               },
//             ],
//             paymentStatus: "refunded",
//             notes: `Return for ${originalSale.orderNumber}: ${input.reason}`,
//             currency: originalSale.currency,
//             saleDate: new Date(),
//             servedBy: userId,
//             createdBy: userId,
//             tenantId,
//           },
//         ],
//         { session },
//       ).then((d) => d[0]);

//       // Update original sale returned quantities
//       for (const ret of input.items) {
//         await Sale.updateOne(
//           { _id: originalSaleId, "items._id": ret.saleItemId },
//           { $inc: { "items.$.returnedQuantity": ret.returnQuantity } },
//           { session },
//         );
//       }

//       // Determine if fully or partially returned
//       const allReturned = input.items.every((ret) => {
//         const origItem = originalSale.items.find(
//           (i) => i._id?.toString() === ret.saleItemId,
//         )!;
//         return ret.returnQuantity >= origItem.quantity;
//       });

//       await Sale.findByIdAndUpdate(
//         originalSaleId,
//         {
//           status: allReturned ? "refunded" : "partial_refund",
//           updatedBy: userId,
//         },
//         { session },
//       );

//       // Restock items
//       for (const ret of input.items) {
//         const origItem = originalSale.items.find(
//           (i) => i._id?.toString() === ret.saleItemId,
//         )!;
//         const shouldRestock =
//           input.items.find((r) => r.saleItemId === ret.saleItemId)
//             ?.restockToWarehouse ?? true;
//         if (shouldRestock) {
//           const product = await Product.findById(origItem.productId);
//           if (product?.isTrackingStock) {
//             await stockService.adjustStock(
//               {
//                 productId: origItem.productId.toString(),
//                 warehouseId: originalSale.warehouseId.toString(),
//                 quantity: ret.returnQuantity,
//                 type: "sale_return",
//                 costPrice: origItem.costPrice,
//                 referenceType: "return",
//                 referenceId: returnSale._id.toString(),
//                 referenceNumber: returnOrderNumber,
//                 notes: input.reason,
//               },
//               tenantId,
//               userId,
//             );
//           }
//         }
//         // Update product totals
//         await Product.findByIdAndUpdate(
//           origItem.productId,
//           {
//             $inc: {
//               totalSold: -ret.returnQuantity,
//               totalRevenue: -(origItem.unitPrice * ret.returnQuantity),
//             },
//           },
//           { session },
//         );
//       }

//       await session.commitTransaction();

//       logger.info(
//         `Return processed: ${returnOrderNumber} for ${originalSale.orderNumber} total=-${returnTotal}`,
//       );
//       emitToTenant(tenantId, "sale_return", {
//         returnId: returnSale._id,
//         originalId: originalSaleId,
//         returnTotal,
//       });

//       return Sale.findById(returnSale._id).populate(
//         "warehouseId",
//         "name code",
//       ) as Promise<ISale>;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       await session.endSession();
//     }
//   }

//   // ── Daily closing / Z-report ───────────────────────────────────────────────
//   async getDailyClosing(
//     input: {
//       warehouseId: string;
//       cashRegisterId?: string;
//       expectedCash: number;
//       actualCash: number;
//       notes?: string;
//     },
//     tenantId: string,
//     userId: string,
//   ) {
//     const today = new Date();
//     const start = new Date(
//       today.getFullYear(),
//       today.getMonth(),
//       today.getDate(),
//     );
//     const end = new Date(start.getTime() + 86_400_000);

//     const filter: Record<string, unknown> = {
//       tenantId,
//       warehouseId: input.warehouseId,
//       saleDate: { $gte: start, $lt: end },
//       status: { $nin: ["draft", "cancelled"] },
//     };
//     if (input.cashRegisterId) filter.cashRegisterId = input.cashRegisterId;

//     const [salesAgg, returnsAgg, paymentBreakdown] = await Promise.all([
//       Sale.aggregate([
//         { $match: { ...filter, isReturn: false } },
//         {
//           $group: {
//             _id: null,
//             count: { $sum: 1 },
//             subtotal: { $sum: "$subtotal" },
//             discount: { $sum: "$discountAmount" },
//             tax: { $sum: "$taxAmount" },
//             total: { $sum: "$total" },
//             paid: { $sum: "$amountPaid" },
//             due: { $sum: "$amountDue" },
//           },
//         },
//       ]),
//       Sale.aggregate([
//         { $match: { ...filter, isReturn: true } },
//         {
//           $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } },
//         },
//       ]),
//       Sale.aggregate([
//         { $match: { ...filter, isReturn: false } },
//         { $unwind: "$payments" },
//         { $match: { "payments.status": "completed" } },
//         {
//           $group: {
//             _id: "$payments.method",
//             total: { $sum: "$payments.amount" },
//             count: { $sum: 1 },
//           },
//         },
//       ]),
//     ]);

//     const sales = salesAgg[0] ?? {
//       count: 0,
//       subtotal: 0,
//       discount: 0,
//       tax: 0,
//       total: 0,
//       paid: 0,
//       due: 0,
//     };
//     const returns = returnsAgg[0] ?? { count: 0, total: 0 };
//     const cashVariance = input.actualCash - input.expectedCash;

//     const report = {
//       generatedAt: new Date(),
//       warehouseId: input.warehouseId,
//       cashRegisterId: input.cashRegisterId,
//       period: { start, end },
//       sales: {
//         count: sales.count,
//         subtotal: sales.subtotal,
//         discount: sales.discount,
//         tax: sales.tax,
//         total: sales.total,
//       },
//       collections: { total: sales.paid, outstanding: sales.due },
//       returns: { count: returns.count, total: Math.abs(returns.total ?? 0) },
//       netTotal: sales.total + (returns.total ?? 0),
//       paymentBreakdown,
//       cashCount: {
//         expected: input.expectedCash,
//         actual: input.actualCash,
//         variance: cashVariance,
//         isBalanced: Math.abs(cashVariance) < 1,
//       },
//       notes: input.notes,
//       closedBy: userId,
//     };

//     logger.info(
//       `Daily closing generated for warehouse ${input.warehouseId} by ${userId}`,
//     );
//     return report;
//   }

//   // ── Sales statistics ───────────────────────────────────────────────────────
//   async getSalesStats(
//     query: {
//       from?: string;
//       to?: string;
//       warehouseId?: string;
//       groupBy?: "day" | "week" | "month";
//     },
//     tenantId: string,
//   ) {
//     return getOrSet(
//       `sales:stats:${tenantId}:${JSON.stringify(query)}`,
//       async () => {
//         const match: Record<string, unknown> = {
//           tenantId,
//           status: { $nin: ["draft", "cancelled"] },
//           isReturn: false,
//         };
//         if (query.warehouseId)
//           match.warehouseId = new Types.ObjectId(query.warehouseId);
//         Object.assign(
//           match,
//           buildDateRangeQuery(query.from, query.to, "saleDate"),
//         );

//         const [
//           overview,
//           byPaymentMethod,
//           topProducts,
//           topCustomers,
//           salesTrend,
//         ] = await Promise.all([
//           // Overall summary
//           Sale.aggregate([
//             { $match: match },
//             {
//               $group: {
//                 _id: null,
//                 totalOrders: { $sum: 1 },
//                 totalRevenue: { $sum: "$total" },
//                 totalDiscount: { $sum: "$discountAmount" },
//                 totalTax: { $sum: "$taxAmount" },
//                 avgOrderValue: { $avg: "$total" },
//                 totalPaid: { $sum: "$amountPaid" },
//                 totalDue: { $sum: "$amountDue" },
//               },
//             },
//           ]),
//           // Payment method breakdown
//           Sale.aggregate([
//             { $match: match },
//             { $unwind: "$payments" },
//             { $match: { "payments.status": "completed" } },
//             {
//               $group: {
//                 _id: "$payments.method",
//                 total: { $sum: "$payments.amount" },
//                 count: { $sum: 1 },
//               },
//             },
//             { $sort: { total: -1 } },
//           ]),
//           // Top selling products
//           Sale.aggregate([
//             { $match: match },
//             { $unwind: "$items" },
//             {
//               $group: {
//                 _id: "$items.productId",
//                 name: { $first: "$items.name" },
//                 sku: { $first: "$items.sku" },
//                 qty: { $sum: "$items.quantity" },
//                 revenue: { $sum: "$items.total" },
//               },
//             },
//             { $sort: { revenue: -1 } },
//             { $limit: 10 },
//           ]),
//           // Top customers
//           Sale.aggregate([
//             { $match: { ...match, customerId: { $exists: true, $ne: null } } },
//             {
//               $group: {
//                 _id: "$customerId",
//                 customerName: { $first: "$customerName" },
//                 orders: { $sum: 1 },
//                 total: { $sum: "$total" },
//               },
//             },
//             { $sort: { total: -1 } },
//             { $limit: 10 },
//           ]),
//           // Sales trend
//           Sale.aggregate([
//             { $match: match },
//             {
//               $group: {
//                 _id: {
//                   $dateToString: {
//                     format: query.groupBy === "month" ? "%Y-%m" : "%Y-%m-%d",
//                     date: "$saleDate",
//                   },
//                 },
//                 count: { $sum: 1 },
//                 revenue: { $sum: "$total" },
//               },
//             },
//             { $sort: { _id: 1 } },
//           ]),
//         ]);

//         return {
//           overview: overview[0] ?? {
//             totalOrders: 0,
//             totalRevenue: 0,
//             totalDiscount: 0,
//             totalTax: 0,
//             avgOrderValue: 0,
//             totalPaid: 0,
//             totalDue: 0,
//           },
//           byPaymentMethod,
//           topProducts,
//           topCustomers,
//           salesTrend,
//         };
//       },
//       { prefix: CachePrefix.DASHBOARD, ttl: 300 },
//     );
//   }

//   // ── Customers ──────────────────────────────────────────────────────────────
//   async getCustomers(
//     query: PaginationQuery & { type?: string; isActive?: string },
//     tenantId: string,
//   ): Promise<PaginatedResult<ICustomer>> {
//     const { page, limit, skip, sort } = parsePagination(query, "name");
//     const filter: Record<string, unknown> = { tenantId };
//     if (query.type) filter.type = query.type;
//     if (query.isActive !== undefined)
//       filter.isActive = query.isActive === "true";
//     if (query.search)
//       Object.assign(
//         filter,
//         buildSearchQuery(query.search, [
//           "name",
//           "phone",
//           "email",
//           "customerNumber",
//         ]),
//       );

//     const [data, total] = await Promise.all([
//       Customer.find(filter).sort(sort).skip(skip).limit(limit).lean(),
//       Customer.countDocuments(filter),
//     ]);
//     return {
//       data: data as ICustomer[],
//       pagination: buildPaginationMeta(total, page, limit),
//     };
//   }

//   async getCustomerById(id: string, tenantId: string): Promise<ICustomer> {
//     const c = await Customer.findOne({ _id: id, tenantId });
//     if (!c) throw new NotFoundError("Customer");
//     return c;
//   }

//   async createCustomer(
//     input: Partial<ICustomer>,
//     tenantId: string,
//     userId: string,
//   ): Promise<ICustomer> {
//     if (input.phone) {
//       const exists = await Customer.findOne({ phone: input.phone, tenantId });
//       if (exists)
//         throw new ConflictError(
//           `Customer with phone "${input.phone}" already exists`,
//         );
//     }
//     return Customer.create({
//       ...input,
//       customerNumber: generateCustomerNumber(tenantId),
//       tenantId,
//       createdBy: userId,
//     });
//   }

//   async updateCustomer(
//     id: string,
//     input: Partial<ICustomer>,
//     tenantId: string,
//   ): Promise<ICustomer> {
//     const customer = await Customer.findOneAndUpdate(
//       { _id: id, tenantId },
//       input,
//       { new: true, runValidators: true },
//     );
//     if (!customer) throw new NotFoundError("Customer");
//     return customer;
//   }

//   async getCustomerSales(
//     customerId: string,
//     tenantId: string,
//     limit = 20,
//   ): Promise<ISale[]> {
//     return Sale.find({ customerId, tenantId })
//       .sort({ saleDate: -1 })
//       .limit(limit)
//       .select("orderNumber type status total paymentStatus saleDate")
//       .lean() as Promise<ISale[]>;
//   }

//   async adjustCustomerCredit(
//     id: string,
//     amount: number,
//     notes: string,
//     tenantId: string,
//   ): Promise<ICustomer> {
//     const customer = await Customer.findOne({ _id: id, tenantId });
//     if (!customer) throw new NotFoundError("Customer");
//     const newBalance = customer.creditBalance + amount;
//     if (newBalance < 0)
//       throw new BadRequestError(
//         "Credit adjustment would result in negative balance",
//       );
//     if (newBalance > customer.creditLimit)
//       throw new BadRequestError(
//         `Exceeds credit limit of ${customer.creditLimit}`,
//       );
//     return Customer.findByIdAndUpdate(
//       id,
//       { creditBalance: newBalance },
//       { new: true },
//     ) as Promise<ICustomer>;
//   }
// }

// export const saleService = new SaleService();
