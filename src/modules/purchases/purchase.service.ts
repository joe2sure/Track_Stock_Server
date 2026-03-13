import mongoose, { Types } from 'mongoose';
import PurchaseOrder, { IPurchaseOrder, IPOItem, IPOPayment, POPaymentStatus } from './purchaseOrder.model';
import GRN, { IGRN, IGRNItem } from './grn.model';
import PurchaseReturn, { IPurchaseReturn } from './purchaseReturn.model';
import Supplier from '../suppliers/supplier.model';
import Product from '../products/product.model';
import Warehouse from '../warehouses/warehouse.model';
import { stockService } from '../stock/stock.service';
import {
  parsePagination, buildPaginationMeta, buildDateRangeQuery, buildSearchQuery,
} from '../../shared/utils/pagination';
import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import { emitToTenant } from '../../server';
import logger from '../../config/logger';

// ── Number generators ────────────────────────────────────────────────────────
async function genPONumber(tenantId: string): Promise<string> {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await PurchaseOrder.countDocuments({
    tenantId,
    createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
  });
  return `PO-${ym}-${String(count + 1).padStart(4, '0')}`;
}

async function genGRNNumber(tenantId: string): Promise<string> {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await GRN.countDocuments({
    tenantId,
    createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
  });
  return `GRN-${ym}-${String(count + 1).padStart(4, '0')}`;
}

async function genReturnNumber(tenantId: string): Promise<string> {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await PurchaseReturn.countDocuments({
    tenantId,
    createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
  });
  return `PR-${ym}-${String(count + 1).padStart(4, '0')}`;
}

// ── PO calc helper ───────────────────────────────────────────────────────────
interface POItemInput {
  productId: string;
  variantId?: string;
  orderedQuantity: number;
  unitCost: number;
  discountPercent?: number;
  taxRate?: number;
  notes?: string;
}

interface EnrichedPOItem {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;  // Changed from null to optional
  name: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  notes?: string;
}

function calcPOTotals(
  items: POItemInput[],
  products: Map<string, { name: string; sku: string }>,
  shippingCost = 0,
  otherCharges = 0
) {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const enriched: EnrichedPOItem[] = items.map(i => {
    const prod = products.get(i.productId)!;
    const lineSubtotal = i.unitCost * i.orderedQuantity;
    const discPct = i.discountPercent ?? 0;
    const discAmt = parseFloat((lineSubtotal * discPct / 100).toFixed(2));
    const taxable = lineSubtotal - discAmt;
    const taxRate = i.taxRate ?? 0;
    const taxAmt  = parseFloat((taxable * taxRate / 100).toFixed(2));
    const lineTotal = parseFloat((taxable + taxAmt).toFixed(2));

    subtotal      += lineSubtotal;
    discountTotal += discAmt;
    taxTotal      += taxAmt;

    return {
      productId:        new Types.ObjectId(i.productId),
      variantId:        i.variantId ? new Types.ObjectId(i.variantId) : undefined,  // Use undefined instead of null
      name:             prod.name,
      sku:              prod.sku,
      orderedQuantity:  i.orderedQuantity,
      receivedQuantity: 0,
      unitCost:         i.unitCost,
      discountPercent:  discPct,
      discountAmount:   discAmt,
      taxRate,
      taxAmount:        taxAmt,
      subtotal:         lineSubtotal,
      total:            lineTotal,
      notes:            i.notes,
    };
  });

  const total = parseFloat((subtotal - discountTotal + taxTotal + shippingCost + otherCharges).toFixed(2));
  return { enriched, subtotal, discountAmount: discountTotal, taxAmount: taxTotal, total };
}

// ── Payment status helper ────────────────────────────────────────────────────
function calcPayStatus(total: number, paid: number, dueDate?: Date): POPaymentStatus {
  if (paid <= 0) {
    if (dueDate && dueDate < new Date()) return 'overdue';
    return 'unpaid';
  }
  if (paid >= total - 0.01) return 'paid';
  return 'partial';
}

// ── Service ──────────────────────────────────────────────────────────────────
export class PurchaseService {

  // ── Purchase Orders ──────────────────────────────────────────────────────

  async createPO(
    input: {
      supplierId: string;
      warehouseId: string;
      items: POItemInput[];
      shippingCost?: number;
      otherCharges?: number;
      notes?: string;
      internalNotes?: string;
      orderDate?: Date;
      expectedDate?: Date;
      supplierReference?: string;
      currency?: string;
    },
    tenantId: string,
    userId: string
  ): Promise<IPurchaseOrder> {
    const [supplier, warehouse] = await Promise.all([
      Supplier.findOne({ _id: input.supplierId, tenantId }),
      Warehouse.findOne({ _id: input.warehouseId, tenantId }),
    ]);
    if (!supplier)  throw new NotFoundError('Supplier');
    if (!warehouse) throw new NotFoundError('Warehouse');

    const productIds = [...new Set(input.items.map(i => i.productId))];
    const products   = await Product.find({ _id: { $in: productIds }, tenantId }).select('name sku costPrice');
    const productMap = new Map(products.map(p => [p._id.toString(), { name: p.name, sku: p.sku }]));

    for (const item of input.items) {
      if (!productMap.has(item.productId)) throw new NotFoundError(`Product ${item.productId}`);
    }

    const shipping = input.shippingCost ?? 0;
    const other    = input.otherCharges ?? 0;
    const { enriched, subtotal, discountAmount, taxAmount, total } = calcPOTotals(input.items, productMap, shipping, other);

    const poNumber = await genPONumber(tenantId);

    const po = await PurchaseOrder.create({
      poNumber,
      supplierId:        new Types.ObjectId(input.supplierId),
      supplierName:      supplier.name,
      warehouseId:       new Types.ObjectId(input.warehouseId),
      status:            'draft',
      paymentStatus:     'unpaid',
      items:             enriched,
      subtotal,
      discountAmount,
      taxAmount,
      shippingCost:      shipping,
      otherCharges:      other,
      total,
      amountPaid:        0,
      amountDue:         total,
      payments:          [],
      orderDate:         input.orderDate ?? new Date(),
      expectedDate:      input.expectedDate,
      notes:             input.notes,
      internalNotes:     input.internalNotes,
      supplierReference: input.supplierReference,
      currency:          input.currency ?? 'NGN',
      exchangeRate:      1,
      orderedBy:         new Types.ObjectId(userId),
      createdBy:         new Types.ObjectId(userId),
      tenantId,
    });

    logger.info(`PO created: ${poNumber} supplier=${supplier.name} total=${total}`);
    const createdPO = await PurchaseOrder.findById(po._id)
      .populate('supplierId', 'name phone email')
      .populate('warehouseId', 'name code');
    
    if (!createdPO) throw new NotFoundError('Purchase Order');
    return createdPO;
  }

  async getPOs(
    query: PaginationQuery & {
      status?: string; paymentStatus?: string;
      supplierId?: string; warehouseId?: string;
      from?: string; to?: string;
    },
    tenantId: string
  ): Promise<PaginatedResult<IPurchaseOrder>> {
    const { page, limit, skip } = parsePagination(query, 'orderDate');
    const filter: Record<string, unknown> = { tenantId };

    if (query.status)        filter.status        = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.supplierId)    filter.supplierId    = new Types.ObjectId(query.supplierId);
    if (query.warehouseId)   filter.warehouseId   = new Types.ObjectId(query.warehouseId);
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['poNumber', 'supplierName', 'supplierReference']));
    Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'orderDate'));

    const [data, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name code')
        .populate('orderedBy', 'name')
        .sort({ orderDate: -1 }).skip(skip).limit(limit)
        .lean() as unknown as IPurchaseOrder[],
      PurchaseOrder.countDocuments(filter),
    ]);
    return { data, pagination: buildPaginationMeta(total, page, limit) };
  }

  async getPOById(id: string, tenantId: string): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId })
      .populate('supplierId', 'name phone email contactPerson bankName bankAccountNumber')
      .populate('warehouseId', 'name code city')
      .populate('orderedBy', 'name email')
      .populate('approvedBy', 'name email');
    if (!po) throw new NotFoundError('Purchase Order');
    return po;
  }

  async updatePO(
    id: string,
    input: {
      items?: POItemInput[];
      shippingCost?: number;
      otherCharges?: number;
      notes?: string;
      internalNotes?: string;
      expectedDate?: Date;
      supplierReference?: string;
    },
    tenantId: string,
    userId: string
  ): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) throw new NotFoundError('Purchase Order');
    if (!['draft', 'sent'].includes(po.status)) {
      throw new BadRequestError(`Cannot edit a PO with status "${po.status}"`);
    }

    const updates: Partial<IPurchaseOrder> = {
      notes:             input.notes,
      internalNotes:     input.internalNotes,
      expectedDate:      input.expectedDate,
      supplierReference: input.supplierReference,
      updatedBy:         new Types.ObjectId(userId),
    };

    if (input.items) {
      const productIds = [...new Set(input.items.map(i => i.productId))];
      const products   = await Product.find({ _id: { $in: productIds }, tenantId }).select('name sku');
      const productMap = new Map(products.map(p => [p._id.toString(), { name: p.name, sku: p.sku }]));
      const shipping   = input.shippingCost ?? po.shippingCost;
      const other      = input.otherCharges ?? po.otherCharges;
      const { enriched, subtotal, discountAmount, taxAmount, total } = calcPOTotals(input.items, productMap, shipping, other);

      Object.assign(updates, {
        items: enriched,
        subtotal,
        discountAmount,
        taxAmount,
        shippingCost: shipping,
        otherCharges: other,
        total,
        amountDue: total - po.amountPaid,
      });
    }

    const updatedPO = await PurchaseOrder.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedPO) throw new NotFoundError('Purchase Order');
    return updatedPO;
  }

  async sendPO(id: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) throw new NotFoundError('Purchase Order');
    if (po.status !== 'draft') throw new BadRequestError(`PO is already ${po.status}`);
    
    const updatedPO = await PurchaseOrder.findByIdAndUpdate(id, 
      { status: 'sent', updatedBy: new Types.ObjectId(userId) }, 
      { new: true }
    );
    if (!updatedPO) throw new NotFoundError('Purchase Order');
    return updatedPO;
  }

  async approvePO(id: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) throw new NotFoundError('Purchase Order');
    if (!['draft', 'sent'].includes(po.status)) throw new BadRequestError(`Cannot approve PO with status "${po.status}"`);
    
    const updatedPO = await PurchaseOrder.findByIdAndUpdate(id, {
      status: 'acknowledged',
      approvedBy: new Types.ObjectId(userId),
      approvedAt: new Date(),
      updatedBy: new Types.ObjectId(userId),
    }, { new: true });
    
    if (!updatedPO) throw new NotFoundError('Purchase Order');
    return updatedPO;
  }

  async cancelPO(id: string, reason: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) throw new NotFoundError('Purchase Order');
    if (['received', 'closed', 'cancelled'].includes(po.status)) {
      throw new BadRequestError(`Cannot cancel PO with status "${po.status}"`);
    }
    
    const updatedPO = await PurchaseOrder.findByIdAndUpdate(id, {
      status: 'cancelled',
      internalNotes: `${po.internalNotes ?? ''}\nCancelled by ${userId}: ${reason}`.trim(),
      updatedBy: new Types.ObjectId(userId),
    }, { new: true });
    
    if (!updatedPO) throw new NotFoundError('Purchase Order');
    return updatedPO;
  }

  async addPaymentToPO(
    id: string,
    paymentData: { method: IPOPayment['method']; amount: number; reference?: string; paidAt?: Date; notes?: string },
    tenantId: string,
    userId: string
  ): Promise<IPurchaseOrder> {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) throw new NotFoundError('Purchase Order');
    if (po.status === 'cancelled') throw new BadRequestError('Cannot add payment to a cancelled PO');

    po.payments.push({
      method:    paymentData.method,
      amount:    paymentData.amount,
      reference: paymentData.reference,
      paidAt:    paymentData.paidAt ?? new Date(),
      notes:     paymentData.notes,
    } as IPOPayment);

    const newPaid     = po.payments.reduce((s, p) => s + p.amount, 0);
    const newDue      = Math.max(0, po.total - newPaid);
    const newPayStatus = calcPayStatus(po.total, newPaid, po.expectedDate);

    po.amountPaid    = newPaid;
    po.amountDue     = newDue;
    po.paymentStatus = newPayStatus;

    // Update supplier credit balance
    await Supplier.findByIdAndUpdate(po.supplierId, { $inc: { creditBalance: -paymentData.amount } });

    await po.save();
    logger.info(`Payment added to PO ${po.poNumber}: ${paymentData.method} ${paymentData.amount}`);
    return po;
  }

  // ── Goods Receipt Notes ──────────────────────────────────────────────────

  async createGRN(
    input: {
      purchaseOrderId: string;
      items: Array<{
        poItemId: string;
        productId: string;
        variantId?: string;
        receivedQuantity: number;
        rejectedQuantity?: number;
        unitCost?: number;
        batchNumber?: string;
        expiryDate?: Date;
        locationCode?: string;
        notes?: string;
      }>;
      deliveryNote?: string;
      vehicleNumber?: string;
      driverName?: string;
      notes?: string;
      internalNotes?: string;
      receivedAt?: Date;
    },
    tenantId: string,
    userId: string
  ): Promise<IGRN> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const po = await PurchaseOrder.findOne({ _id: input.purchaseOrderId, tenantId }).session(session);
      if (!po) throw new NotFoundError('Purchase Order');
      if (['cancelled', 'closed'].includes(po.status)) {
        throw new BadRequestError(`Cannot receive goods for a ${po.status} PO`);
      }

      // Build GRN items, linking back to PO items
      const grnItems: Omit<IGRNItem, '_id'>[] = [];
      for (const item of input.items) {
        const poItem = po.items.find(i => i._id?.toString() === item.poItemId);
        if (!poItem) throw new NotFoundError(`PO item ${item.poItemId}`);

        const alreadyReceived = poItem.receivedQuantity;
        const remaining       = poItem.orderedQuantity - alreadyReceived;
        const received        = item.receivedQuantity;
        const rejected        = item.rejectedQuantity ?? 0;
        const accepted        = received - rejected;

        if (received > remaining + 0.001) {
          throw new BadRequestError(
            `Received qty (${received}) exceeds remaining qty (${remaining}) for ${poItem.name}`
          );
        }
        if (accepted < 0) throw new BadRequestError(`Rejected qty cannot exceed received qty for ${poItem.name}`);

        grnItems.push({
          poItemId:         new Types.ObjectId(item.poItemId),
          productId:        new Types.ObjectId(item.productId),
          variantId:        item.variantId ? new Types.ObjectId(item.variantId) : undefined,
          name:             poItem.name,
          sku:              poItem.sku,
          orderedQuantity:  poItem.orderedQuantity,
          receivedQuantity: received,
          rejectedQuantity: rejected,
          acceptedQuantity: accepted,
          unitCost:         item.unitCost ?? poItem.unitCost,
          batchNumber:      item.batchNumber,
          expiryDate:       item.expiryDate,
          locationCode:     item.locationCode,
          notes:            item.notes,
        });
      }

      const grnNumber = await genGRNNumber(tenantId);
      const grn = await GRN.create([{
        grnNumber,
        purchaseOrderId: new Types.ObjectId(input.purchaseOrderId),
        poNumber:        po.poNumber,
        supplierId:      po.supplierId,
        supplierName:    po.supplierName,
        warehouseId:     po.warehouseId,
        status:          'confirmed',
        items:           grnItems,
        deliveryNote:    input.deliveryNote,
        vehicleNumber:   input.vehicleNumber,
        driverName:      input.driverName,
        notes:           input.notes,
        internalNotes:   input.internalNotes,
        receivedBy:      new Types.ObjectId(userId),
        confirmedBy:     new Types.ObjectId(userId),
        confirmedAt:     new Date(),
        receivedAt:      input.receivedAt ?? new Date(),
        tenantId,
      }], { session }).then(d => d[0]);

      // Add accepted stock to warehouse + update PO received quantities
      for (const item of grnItems) {
        if (item.acceptedQuantity > 0) {
          await stockService.adjustStock({
            productId:       item.productId.toString(),
            variantId:       item.variantId?.toString(),
            warehouseId:     po.warehouseId.toString(),
            quantity:        item.acceptedQuantity,
            type:            'purchase_receipt',
            costPrice:       item.unitCost,
            batchNumber:     item.batchNumber,
            expiryDate:      item.expiryDate,
            referenceType:   'purchase',
            referenceId:     grn._id.toString(),
            referenceNumber: grnNumber,
            notes:           `GRN ${grnNumber} from ${po.supplierName}`,
          }, tenantId, userId);

          // Update product costPrice to latest
          await Product.findByIdAndUpdate(item.productId, { costPrice: item.unitCost }, { session });
        }

        // Update the PO item receivedQuantity
        await PurchaseOrder.updateOne(
          { _id: input.purchaseOrderId, 'items._id': item.poItemId },
          { $inc: { 'items.$.receivedQuantity': item.receivedQuantity } },
          { session }
        );
      }

      // Update PO status
      const updatedPO = await PurchaseOrder.findById(input.purchaseOrderId).session(session);
      if (updatedPO) {
        const allReceived = updatedPO.items.every(i => i.receivedQuantity >= i.orderedQuantity);
        const anyReceived = updatedPO.items.some(i => i.receivedQuantity > 0);
        const newStatus   = allReceived ? 'received' : anyReceived ? 'partial' : updatedPO.status;
        await PurchaseOrder.findByIdAndUpdate(input.purchaseOrderId, { status: newStatus }, { session });
      }

      // Update supplier stats
      const grnValue = grnItems.reduce((s, i) => s + i.acceptedQuantity * i.unitCost, 0);
      await Supplier.findByIdAndUpdate(po.supplierId, {
        $inc: { totalOrders: 0, totalPurchased: grnValue },  // totalOrders incremented on PO creation
        $set: { lastOrderAt: new Date() },
      }, { session });

      await session.commitTransaction();

      logger.info(`GRN confirmed: ${grnNumber} for PO ${po.poNumber} value=${grnValue}`);
      emitToTenant(tenantId, 'grn_received', { grnNumber, poNumber: po.poNumber, warehouseId: po.warehouseId });

      const createdGRN = await GRN.findById(grn._id)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name code');
      
      if (!createdGRN) throw new NotFoundError('GRN');
      return createdGRN;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async getGRNs(
    query: PaginationQuery & {
      supplierId?: string; warehouseId?: string; purchaseOrderId?: string;
      from?: string; to?: string;
    },
    tenantId: string
  ): Promise<PaginatedResult<IGRN>> {
    const { page, limit, skip } = parsePagination(query, 'receivedAt');
    const filter: Record<string, unknown> = { tenantId };

    if (query.supplierId)      filter.supplierId      = new Types.ObjectId(query.supplierId);
    if (query.warehouseId)     filter.warehouseId     = new Types.ObjectId(query.warehouseId);
    if (query.purchaseOrderId) filter.purchaseOrderId = new Types.ObjectId(query.purchaseOrderId);
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['grnNumber', 'poNumber', 'supplierName', 'deliveryNote']));
    Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'receivedAt'));

    const [data, total] = await Promise.all([
      GRN.find(filter)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name code')
        .populate('receivedBy', 'name')
        .sort({ receivedAt: -1 }).skip(skip).limit(limit)
        .lean() as unknown as IGRN[],
      GRN.countDocuments(filter),
    ]);
    return { data, pagination: buildPaginationMeta(total, page, limit) };
  }

  async getGRNById(id: string, tenantId: string): Promise<IGRN> {
    const grn = await GRN.findOne({ _id: id, tenantId })
      .populate('supplierId', 'name phone email contactPerson')
      .populate('warehouseId', 'name code city')
      .populate('receivedBy', 'name email')
      .populate('purchaseOrderId', 'poNumber total');
    if (!grn) throw new NotFoundError('GRN');
    return grn;
  }

  // ── Purchase Returns ─────────────────────────────────────────────────────

  async createPurchaseReturn(
    input: {
      supplierId: string;
      purchaseOrderId?: string;
      grnId?: string;
      warehouseId: string;
      items: Array<{
        productId: string;
        variantId?: string;
        returnQuantity: number;
        unitCost: number;
        reason: IPurchaseReturn['items'][0]['reason'];
        notes?: string;
      }>;
      refundMethod?: IPurchaseReturn['refundMethod'];
      notes?: string;
    },
    tenantId: string,
    userId: string
  ): Promise<IPurchaseReturn> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const [supplier, warehouse] = await Promise.all([
        Supplier.findOne({ _id: input.supplierId, tenantId }),
        Warehouse.findOne({ _id: input.warehouseId, tenantId }),
      ]);
      if (!supplier)  throw new NotFoundError('Supplier');
      if (!warehouse) throw new NotFoundError('Warehouse');

      let totalAmount = 0;
      const returnItems = [];

      for (const item of input.items) {
        const product = await Product.findOne({ _id: item.productId, tenantId });
        if (!product) throw new NotFoundError(`Product ${item.productId}`);

        const itemTotal = parseFloat((item.returnQuantity * item.unitCost).toFixed(2));
        totalAmount += itemTotal;

        returnItems.push({
          productId:      new Types.ObjectId(item.productId),
          variantId:      item.variantId ? new Types.ObjectId(item.variantId) : undefined,  // Use undefined instead of null
          name:           product.name,
          sku:            product.sku,
          returnQuantity: item.returnQuantity,
          unitCost:       item.unitCost,
          total:          itemTotal,
          reason:         item.reason,
          notes:          item.notes,
        });

        // Deduct stock from warehouse
        await stockService.adjustStock({
          productId:   item.productId,
          variantId:   item.variantId,
          warehouseId: input.warehouseId,
          quantity:    -item.returnQuantity,  // Negative for reduction
          type:        'damage',
          costPrice:   item.unitCost,
          referenceType: 'purchase',
          referenceNumber: '',  // Will be updated after return is created
          notes:       `Purchase return to ${supplier.name}: ${item.reason}`,
        }, tenantId, userId);
      }

      const returnNumber = await genReturnNumber(tenantId);
      let poNumber: string | undefined;
      let grnNumber: string | undefined;

      if (input.purchaseOrderId) {
        const po = await PurchaseOrder.findById(input.purchaseOrderId).session(session);
        poNumber = po?.poNumber;
      }
      if (input.grnId) {
        const grn = await GRN.findById(input.grnId).session(session);
        grnNumber = grn?.grnNumber;
      }

      const [returnDoc] = await PurchaseReturn.create([{
        returnNumber,
        purchaseOrderId:  input.purchaseOrderId ? new Types.ObjectId(input.purchaseOrderId) : undefined,
        poNumber,
        grnId:            input.grnId ? new Types.ObjectId(input.grnId) : undefined,
        grnNumber,
        supplierId:       new Types.ObjectId(input.supplierId),
        supplierName:     supplier.name,
        warehouseId:      new Types.ObjectId(input.warehouseId),
        status:           'pending',
        items:            returnItems,
        totalAmount,
        refundMethod:     input.refundMethod,
        notes:            input.notes,
        returnedBy:       new Types.ObjectId(userId),
        tenantId,
      }], { session });

      await session.commitTransaction();

      logger.info(`Purchase return: ${returnNumber} supplier=${supplier.name} total=${totalAmount}`);
      
      const createdReturn = await PurchaseReturn.findById(returnDoc._id)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name code');
      
      if (!createdReturn) throw new NotFoundError('Purchase Return');
      return createdReturn;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async getPurchaseReturns(
    query: PaginationQuery & { supplierId?: string; status?: string; from?: string; to?: string },
    tenantId: string
  ): Promise<PaginatedResult<IPurchaseReturn>> {
    const { page, limit, skip } = parsePagination(query, 'createdAt');
    const filter: Record<string, unknown> = { tenantId };

    if (query.supplierId) filter.supplierId = new Types.ObjectId(query.supplierId);
    if (query.status)     filter.status     = query.status;
    Object.assign(filter, buildDateRangeQuery(query.from, query.to));

    const [data, total] = await Promise.all([
      PurchaseReturn.find(filter)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name code')
        .populate('returnedBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit)
        .lean() as unknown as IPurchaseReturn[],
      PurchaseReturn.countDocuments(filter),
    ]);
    return { data, pagination: buildPaginationMeta(total, page, limit) };
  }

  async recordCreditNote(
    id: string,
    input: { creditNoteNumber: string; refundAmount: number; refundMethod: IPurchaseReturn['refundMethod'] },
    tenantId: string
  ): Promise<IPurchaseReturn> {
    const ret = await PurchaseReturn.findOne({ _id: id, tenantId });
    if (!ret) throw new NotFoundError('Purchase Return');
    if (ret.status === 'cancelled') throw new BadRequestError('Cannot update a cancelled return');

    const updated = await PurchaseReturn.findByIdAndUpdate(id, {
      status:           'credited',
      creditNoteNumber: input.creditNoteNumber,
      refundAmount:     input.refundAmount,
      refundMethod:     input.refundMethod,
      acknowledgedAt:   new Date(),
    }, { new: true });

    if (!updated) throw new NotFoundError('Purchase Return');

    // Reduce supplier credit balance by refund amount
    await Supplier.findByIdAndUpdate(ret.supplierId, { $inc: { creditBalance: -input.refundAmount } });
    return updated;
  }

  // ── Purchase Stats ───────────────────────────────────────────────────────

  async getPurchaseStats(
    query: { from?: string; to?: string; warehouseId?: string },
    tenantId: string
  ) {
    const match: Record<string, unknown> = {
      tenantId,
      status: { $nin: ['cancelled'] },
    };
    if (query.warehouseId) match.warehouseId = new Types.ObjectId(query.warehouseId);
    Object.assign(match, buildDateRangeQuery(query.from, query.to, 'orderDate'));

    const [overview, byStatus, topSuppliers, pendingPOs, overduePayments] = await Promise.all([
      PurchaseOrder.aggregate([
        { $match: match },
        { $group: {
          _id:           null,
          totalOrders:   { $sum: 1 },
          totalValue:    { $sum: '$total' },
          totalPaid:     { $sum: '$amountPaid' },
          totalDue:      { $sum: '$amountDue' },
          avgOrderValue: { $avg: '$total' },
        }},
      ]),
      PurchaseOrder.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ]),
      PurchaseOrder.aggregate([
        { $match: match },
        { $group: { _id: '$supplierId', supplierName: { $first: '$supplierName' }, orders: { $sum: 1 }, value: { $sum: '$total' } } },
        { $sort: { value: -1 } },
        { $limit: 5 },
      ]),
      PurchaseOrder.find({ tenantId, status: { $in: ['sent', 'acknowledged', 'partial'] } })
        .select('poNumber supplierName total amountDue expectedDate status')
        .sort({ expectedDate: 1 }).limit(10)
        .lean() as unknown as IPurchaseOrder[],
      PurchaseOrder.find({ tenantId, paymentStatus: 'overdue', status: { $nin: ['cancelled', 'closed'] } })
        .select('poNumber supplierName total amountDue expectedDate')
        .sort({ amountDue: -1 }).limit(10)
        .lean() as unknown as IPurchaseOrder[],
    ]);

    return {
      overview: overview[0] ?? { totalOrders: 0, totalValue: 0, totalPaid: 0, totalDue: 0, avgOrderValue: 0 },
      byStatus:  byStatus.reduce<Record<string, { count: number; total: number }>>((acc, s) => {
        acc[s._id as string] = { count: s.count as number, total: s.total as number };
        return acc;
      }, {}),
      topSuppliers,
      pendingPOs,
      overduePayments,
    };
  }
}

export const purchaseService = new PurchaseService();




// import mongoose, { Types } from 'mongoose';
// import PurchaseOrder, { IPurchaseOrder, IPOItem, IPOPayment, POPaymentStatus } from './purchaseOrder.model';
// import GRN, { IGRN, IGRNItem } from './grn.model';
// import PurchaseReturn, { IPurchaseReturn } from './purchaseReturn.model';
// import Supplier from '../suppliers/supplier.model';
// import Product from '../products/product.model';
// import Warehouse from '../warehouses/warehouse.model';
// import { stockService } from '../stock/stock.service';
// import {
//   parsePagination, buildPaginationMeta, buildDateRangeQuery, buildSearchQuery,
// } from '../../shared/utils/pagination';
// import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
// import { PaginationQuery, PaginatedResult } from '../../shared/types';
// import { emitToTenant } from '../../server';
// import logger from '../../config/logger';

// // ── Number generators ────────────────────────────────────────────────────────
// async function genPONumber(tenantId: string): Promise<string> {
//   const d = new Date();
//   const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
//   const count = await PurchaseOrder.countDocuments({
//     tenantId,
//     createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
//   });
//   return `PO-${ym}-${String(count + 1).padStart(4, '0')}`;
// }

// async function genGRNNumber(tenantId: string): Promise<string> {
//   const d = new Date();
//   const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
//   const count = await GRN.countDocuments({
//     tenantId,
//     createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
//   });
//   return `GRN-${ym}-${String(count + 1).padStart(4, '0')}`;
// }

// async function genReturnNumber(tenantId: string): Promise<string> {
//   const d = new Date();
//   const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
//   const count = await PurchaseReturn.countDocuments({
//     tenantId,
//     createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) },
//   });
//   return `PR-${ym}-${String(count + 1).padStart(4, '0')}`;
// }

// // ── PO calc helper ───────────────────────────────────────────────────────────
// interface POItemInput {
//   productId: string;
//   variantId?: string;
//   orderedQuantity: number;
//   unitCost: number;
//   discountPercent?: number;
//   taxRate?: number;
//   notes?: string;
// }

// function calcPOTotals(
//   items: POItemInput[],
//   products: Map<string, { name: string; sku: string }>,
//   shippingCost = 0,
//   otherCharges = 0
// ) {
//   let subtotal = 0;
//   let discountTotal = 0;
//   let taxTotal = 0;

//   const enriched = items.map(i => {
//     const prod = products.get(i.productId)!;
//     const lineSubtotal = i.unitCost * i.orderedQuantity;
//     const discPct = i.discountPercent ?? 0;
//     const discAmt = parseFloat((lineSubtotal * discPct / 100).toFixed(2));
//     const taxable = lineSubtotal - discAmt;
//     const taxRate = i.taxRate ?? 0;
//     const taxAmt  = parseFloat((taxable * taxRate / 100).toFixed(2));
//     const lineTotal = parseFloat((taxable + taxAmt).toFixed(2));

//     subtotal      += lineSubtotal;
//     discountTotal += discAmt;
//     taxTotal      += taxAmt;

//     return {
//       productId:        new Types.ObjectId(i.productId),
//       variantId:        i.variantId ? new Types.ObjectId(i.variantId) : null,
//       name:             prod.name,
//       sku:              prod.sku,
//       orderedQuantity:  i.orderedQuantity,
//       receivedQuantity: 0,
//       unitCost:         i.unitCost,
//       discountPercent:  discPct,
//       discountAmount:   discAmt,
//       taxRate,
//       taxAmount:        taxAmt,
//       subtotal:         lineSubtotal,
//       total:            lineTotal,
//       notes:            i.notes,
//     };
//   });

//   const total = parseFloat((subtotal - discountTotal + taxTotal + shippingCost + otherCharges).toFixed(2));
//   return { enriched, subtotal, discountAmount: discountTotal, taxAmount: taxTotal, total };
// }

// // ── Payment status helper ────────────────────────────────────────────────────
// function calcPayStatus(total: number, paid: number, dueDate?: Date): POPaymentStatus {
//   if (paid <= 0) {
//     if (dueDate && dueDate < new Date()) return 'overdue';
//     return 'unpaid';
//   }
//   if (paid >= total - 0.01) return 'paid';
//   return 'partial';
// }

// // ── Service ──────────────────────────────────────────────────────────────────
// export class PurchaseService {

//   // ── Purchase Orders ──────────────────────────────────────────────────────

//   async createPO(
//     input: {
//       supplierId: string;
//       warehouseId: string;
//       items: POItemInput[];
//       shippingCost?: number;
//       otherCharges?: number;
//       notes?: string;
//       internalNotes?: string;
//       orderDate?: Date;
//       expectedDate?: Date;
//       supplierReference?: string;
//       currency?: string;
//     },
//     tenantId: string,
//     userId: string
//   ): Promise<IPurchaseOrder> {
//     const [supplier, warehouse] = await Promise.all([
//       Supplier.findOne({ _id: input.supplierId, tenantId }),
//       Warehouse.findOne({ _id: input.warehouseId, tenantId }),
//     ]);
//     if (!supplier)  throw new NotFoundError('Supplier');
//     if (!warehouse) throw new NotFoundError('Warehouse');

//     const productIds = [...new Set(input.items.map(i => i.productId))];
//     const products   = await Product.find({ _id: { $in: productIds }, tenantId }).select('name sku costPrice');
//     const productMap = new Map(products.map(p => [p._id.toString(), { name: p.name, sku: p.sku }]));

//     for (const item of input.items) {
//       if (!productMap.has(item.productId)) throw new NotFoundError(`Product ${item.productId}`);
//     }

//     const shipping = input.shippingCost ?? 0;
//     const other    = input.otherCharges ?? 0;
//     const { enriched, subtotal, discountAmount, taxAmount, total } = calcPOTotals(input.items, productMap, shipping, other);

//     const poNumber = await genPONumber(tenantId);

//     const po = await PurchaseOrder.create({
//       poNumber,
//       supplierId:        input.supplierId,
//       supplierName:      supplier.name,
//       warehouseId:       input.warehouseId,
//       status:            'draft',
//       paymentStatus:     'unpaid',
//       items:             enriched,
//       subtotal,
//       discountAmount,
//       taxAmount,
//       shippingCost:      shipping,
//       otherCharges:      other,
//       total,
//       amountPaid:        0,
//       amountDue:         total,
//       payments:          [],
//       orderDate:         input.orderDate ?? new Date(),
//       expectedDate:      input.expectedDate,
//       notes:             input.notes,
//       internalNotes:     input.internalNotes,
//       supplierReference: input.supplierReference,
//       currency:          input.currency ?? 'NGN',
//       orderedBy:         userId,
//       createdBy:         userId,
//       tenantId,
//     });

//     logger.info(`PO created: ${poNumber} supplier=${supplier.name} total=${total}`);
//     return PurchaseOrder.findById(po._id)
//       .populate('supplierId', 'name phone email')
//       .populate('warehouseId', 'name code') as Promise<IPurchaseOrder>;
//   }

//   async getPOs(
//     query: PaginationQuery & {
//       status?: string; paymentStatus?: string;
//       supplierId?: string; warehouseId?: string;
//       from?: string; to?: string;
//     },
//     tenantId: string
//   ): Promise<PaginatedResult<IPurchaseOrder>> {
//     const { page, limit, skip } = parsePagination(query, 'orderDate');
//     const filter: Record<string, unknown> = { tenantId };

//     if (query.status)        filter.status        = query.status;
//     if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
//     if (query.supplierId)    filter.supplierId    = query.supplierId;
//     if (query.warehouseId)   filter.warehouseId   = query.warehouseId;
//     if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['poNumber', 'supplierName', 'supplierReference']));
//     Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'orderDate'));

//     const [data, total] = await Promise.all([
//       PurchaseOrder.find(filter)
//         .populate('supplierId', 'name')
//         .populate('warehouseId', 'name code')
//         .populate('orderedBy', 'name')
//         .sort({ orderDate: -1 }).skip(skip).limit(limit).lean(),
//       PurchaseOrder.countDocuments(filter),
//     ]);
//     return { data: data as IPurchaseOrder[], pagination: buildPaginationMeta(total, page, limit) };
//   }

//   async getPOById(id: string, tenantId: string): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId })
//       .populate('supplierId', 'name phone email contactPerson bankName bankAccountNumber')
//       .populate('warehouseId', 'name code city')
//       .populate('orderedBy', 'name email')
//       .populate('approvedBy', 'name email');
//     if (!po) throw new NotFoundError('Purchase Order');
//     return po;
//   }

//   async updatePO(
//     id: string,
//     input: {
//       items?: POItemInput[];
//       shippingCost?: number;
//       otherCharges?: number;
//       notes?: string;
//       internalNotes?: string;
//       expectedDate?: Date;
//       supplierReference?: string;
//     },
//     tenantId: string,
//     userId: string
//   ): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId });
//     if (!po) throw new NotFoundError('Purchase Order');
//     if (!['draft', 'sent'].includes(po.status)) {
//       throw new BadRequestError(`Cannot edit a PO with status "${po.status}"`);
//     }

//     const updates: Partial<IPurchaseOrder> = {
//       notes:             input.notes,
//       internalNotes:     input.internalNotes,
//       expectedDate:      input.expectedDate,
//       supplierReference: input.supplierReference,
//       updatedBy:         new Types.ObjectId(userId),
//     };

//     if (input.items) {
//       const productIds = [...new Set(input.items.map(i => i.productId))];
//       const products   = await Product.find({ _id: { $in: productIds }, tenantId }).select('name sku');
//       const productMap = new Map(products.map(p => [p._id.toString(), { name: p.name, sku: p.sku }]));
//       const shipping   = input.shippingCost ?? po.shippingCost;
//       const other      = input.otherCharges ?? po.otherCharges;
//       const { enriched, subtotal, discountAmount, taxAmount, total } = calcPOTotals(input.items, productMap, shipping, other);

//       Object.assign(updates, {
//         items: enriched, subtotal, discountAmount, taxAmount,
//         shippingCost: shipping, otherCharges: other,
//         total, amountDue: total - po.amountPaid,
//       });
//     }

//     return PurchaseOrder.findByIdAndUpdate(id, updates, { new: true }) as Promise<IPurchaseOrder>;
//   }

//   async sendPO(id: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId });
//     if (!po) throw new NotFoundError('Purchase Order');
//     if (po.status !== 'draft') throw new BadRequestError(`PO is already ${po.status}`);
//     return PurchaseOrder.findByIdAndUpdate(id, { status: 'sent', updatedBy: userId }, { new: true }) as Promise<IPurchaseOrder>;
//   }

//   async approvePO(id: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId });
//     if (!po) throw new NotFoundError('Purchase Order');
//     if (!['draft', 'sent'].includes(po.status)) throw new BadRequestError(`Cannot approve PO with status "${po.status}"`);
//     return PurchaseOrder.findByIdAndUpdate(id, {
//       status: 'acknowledged', approvedBy: userId, approvedAt: new Date(),
//     }, { new: true }) as Promise<IPurchaseOrder>;
//   }

//   async cancelPO(id: string, reason: string, tenantId: string, userId: string): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId });
//     if (!po) throw new NotFoundError('Purchase Order');
//     if (['received', 'closed', 'cancelled'].includes(po.status)) {
//       throw new BadRequestError(`Cannot cancel PO with status "${po.status}"`);
//     }
//     return PurchaseOrder.findByIdAndUpdate(id, {
//       status: 'cancelled',
//       internalNotes: `${po.internalNotes ?? ''}\nCancelled by ${userId}: ${reason}`.trim(),
//       updatedBy: userId,
//     }, { new: true }) as Promise<IPurchaseOrder>;
//   }

//   async addPaymentToPO(
//     id: string,
//     paymentData: { method: IPOPayment['method']; amount: number; reference?: string; paidAt?: Date; notes?: string },
//     tenantId: string,
//     userId: string
//   ): Promise<IPurchaseOrder> {
//     const po = await PurchaseOrder.findOne({ _id: id, tenantId });
//     if (!po) throw new NotFoundError('Purchase Order');
//     if (po.status === 'cancelled') throw new BadRequestError('Cannot add payment to a cancelled PO');

//     po.payments.push({
//       method:    paymentData.method,
//       amount:    paymentData.amount,
//       reference: paymentData.reference,
//       paidAt:    paymentData.paidAt ?? new Date(),
//       notes:     paymentData.notes,
//     } as IPOPayment);

//     const newPaid     = po.payments.reduce((s, p) => s + p.amount, 0);
//     const newDue      = Math.max(0, po.total - newPaid);
//     const newPayStatus = calcPayStatus(po.total, newPaid, po.expectedDate);

//     po.amountPaid    = newPaid;
//     po.amountDue     = newDue;
//     po.paymentStatus = newPayStatus;

//     // Update supplier credit balance
//     await Supplier.findByIdAndUpdate(po.supplierId, { $inc: { creditBalance: -paymentData.amount } });

//     await po.save();
//     logger.info(`Payment added to PO ${po.poNumber}: ${paymentData.method} ${paymentData.amount}`);
//     return po;
//   }

//   // ── Goods Receipt Notes ──────────────────────────────────────────────────

//   async createGRN(
//     input: {
//       purchaseOrderId: string;
//       items: Array<{
//         poItemId: string;
//         productId: string;
//         variantId?: string;
//         receivedQuantity: number;
//         rejectedQuantity?: number;
//         unitCost?: number;
//         batchNumber?: string;
//         expiryDate?: Date;
//         locationCode?: string;
//         notes?: string;
//       }>;
//       deliveryNote?: string;
//       vehicleNumber?: string;
//       driverName?: string;
//       notes?: string;
//       internalNotes?: string;
//       receivedAt?: Date;
//     },
//     tenantId: string,
//     userId: string
//   ): Promise<IGRN> {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const po = await PurchaseOrder.findOne({ _id: input.purchaseOrderId, tenantId }).session(session);
//       if (!po) throw new NotFoundError('Purchase Order');
//       if (['cancelled', 'closed'].includes(po.status)) {
//         throw new BadRequestError(`Cannot receive goods for a ${po.status} PO`);
//       }

//       // Build GRN items, linking back to PO items
//       const grnItems: Omit<IGRNItem, '_id'>[] = [];
//       for (const item of input.items) {
//         const poItem = po.items.find(i => i._id?.toString() === item.poItemId);
//         if (!poItem) throw new NotFoundError(`PO item ${item.poItemId}`);

//         const alreadyReceived = poItem.receivedQuantity;
//         const remaining       = poItem.orderedQuantity - alreadyReceived;
//         const received        = item.receivedQuantity;
//         const rejected        = item.rejectedQuantity ?? 0;
//         const accepted        = received - rejected;

//         if (received > remaining + 0.001) {
//           throw new BadRequestError(
//             `Received qty (${received}) exceeds remaining qty (${remaining}) for ${poItem.name}`
//           );
//         }
//         if (accepted < 0) throw new BadRequestError(`Rejected qty cannot exceed received qty for ${poItem.name}`);

//         grnItems.push({
//           poItemId:         new Types.ObjectId(item.poItemId),
//           productId:        new Types.ObjectId(item.productId),
//           variantId:        item.variantId ? new Types.ObjectId(item.variantId) : undefined,
//           name:             poItem.name,
//           sku:              poItem.sku,
//           orderedQuantity:  poItem.orderedQuantity,
//           receivedQuantity: received,
//           rejectedQuantity: rejected,
//           acceptedQuantity: accepted,
//           unitCost:         item.unitCost ?? poItem.unitCost,
//           batchNumber:      item.batchNumber,
//           expiryDate:       item.expiryDate,
//           locationCode:     item.locationCode,
//           notes:            item.notes,
//         });
//       }

//       const grnNumber = await genGRNNumber(tenantId);
//       const grn = await GRN.create([{
//         grnNumber,
//         purchaseOrderId: input.purchaseOrderId,
//         poNumber:        po.poNumber,
//         supplierId:      po.supplierId,
//         supplierName:    po.supplierName,
//         warehouseId:     po.warehouseId,
//         status:          'confirmed',
//         items:           grnItems,
//         deliveryNote:    input.deliveryNote,
//         vehicleNumber:   input.vehicleNumber,
//         driverName:      input.driverName,
//         notes:           input.notes,
//         internalNotes:   input.internalNotes,
//         receivedBy:      userId,
//         confirmedBy:     userId,
//         confirmedAt:     new Date(),
//         receivedAt:      input.receivedAt ?? new Date(),
//         tenantId,
//       }], { session }).then(d => d[0]);

//       // Add accepted stock to warehouse + update PO received quantities
//       for (const item of grnItems) {
//         if (item.acceptedQuantity > 0) {
//           await stockService.adjustStock({
//             productId:       item.productId.toString(),
//             variantId:       item.variantId?.toString(),
//             warehouseId:     po.warehouseId.toString(),
//             quantity:        item.acceptedQuantity,
//             type:            'purchase_receipt',
//             costPrice:       item.unitCost,
//             batchNumber:     item.batchNumber,
//             expiryDate:      item.expiryDate,
//             referenceType:   'purchase',
//             referenceId:     grn._id.toString(),
//             referenceNumber: grnNumber,
//             notes:           `GRN ${grnNumber} from ${po.supplierName}`,
//           }, tenantId, userId);

//           // Update product costPrice to latest
//           await Product.findByIdAndUpdate(item.productId, { costPrice: item.unitCost }, { session });
//         }

//         // Update the PO item receivedQuantity
//         await PurchaseOrder.updateOne(
//           { _id: input.purchaseOrderId, 'items._id': item.poItemId },
//           { $inc: { 'items.$.receivedQuantity': item.receivedQuantity } },
//           { session }
//         );
//       }

//       // Update PO status
//       const updatedPO = await PurchaseOrder.findById(input.purchaseOrderId).session(session);
//       if (updatedPO) {
//         const allReceived = updatedPO.items.every(i => i.receivedQuantity >= i.orderedQuantity);
//         const anyReceived = updatedPO.items.some(i => i.receivedQuantity > 0);
//         const newStatus   = allReceived ? 'received' : anyReceived ? 'partial' : updatedPO.status;
//         await PurchaseOrder.findByIdAndUpdate(input.purchaseOrderId, { status: newStatus }, { session });
//       }

//       // Update supplier stats
//       const grnValue = grnItems.reduce((s, i) => s + i.acceptedQuantity * i.unitCost, 0);
//       await Supplier.findByIdAndUpdate(po.supplierId, {
//         $inc: { totalOrders: 0, totalPurchased: grnValue },  // totalOrders incremented on PO creation
//         $set: { lastOrderAt: new Date() },
//       }, { session });

//       await session.commitTransaction();

//       logger.info(`GRN confirmed: ${grnNumber} for PO ${po.poNumber} value=${grnValue}`);
//       emitToTenant(tenantId, 'grn_received', { grnNumber, poNumber: po.poNumber, warehouseId: po.warehouseId });

//       return GRN.findById(grn._id)
//         .populate('supplierId', 'name')
//         .populate('warehouseId', 'name code') as Promise<IGRN>;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       await session.endSession();
//     }
//   }

//   async getGRNs(
//     query: PaginationQuery & {
//       supplierId?: string; warehouseId?: string; purchaseOrderId?: string;
//       from?: string; to?: string;
//     },
//     tenantId: string
//   ): Promise<PaginatedResult<IGRN>> {
//     const { page, limit, skip } = parsePagination(query, 'receivedAt');
//     const filter: Record<string, unknown> = { tenantId };

//     if (query.supplierId)      filter.supplierId      = query.supplierId;
//     if (query.warehouseId)     filter.warehouseId     = query.warehouseId;
//     if (query.purchaseOrderId) filter.purchaseOrderId = query.purchaseOrderId;
//     if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['grnNumber', 'poNumber', 'supplierName', 'deliveryNote']));
//     Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'receivedAt'));

//     const [data, total] = await Promise.all([
//       GRN.find(filter)
//         .populate('supplierId', 'name')
//         .populate('warehouseId', 'name code')
//         .populate('receivedBy', 'name')
//         .sort({ receivedAt: -1 }).skip(skip).limit(limit).lean(),
//       GRN.countDocuments(filter),
//     ]);
//     return { data: data as IGRN[], pagination: buildPaginationMeta(total, page, limit) };
//   }

//   async getGRNById(id: string, tenantId: string): Promise<IGRN> {
//     const grn = await GRN.findOne({ _id: id, tenantId })
//       .populate('supplierId', 'name phone email contactPerson')
//       .populate('warehouseId', 'name code city')
//       .populate('receivedBy', 'name email')
//       .populate('purchaseOrderId', 'poNumber total');
//     if (!grn) throw new NotFoundError('GRN');
//     return grn;
//   }

//   // ── Purchase Returns ─────────────────────────────────────────────────────

//   async createPurchaseReturn(
//     input: {
//       supplierId: string;
//       purchaseOrderId?: string;
//       grnId?: string;
//       warehouseId: string;
//       items: Array<{
//         productId: string;
//         variantId?: string;
//         returnQuantity: number;
//         unitCost: number;
//         reason: IPurchaseReturn['items'][0]['reason'];
//         notes?: string;
//       }>;
//       refundMethod?: IPurchaseReturn['refundMethod'];
//       notes?: string;
//     },
//     tenantId: string,
//     userId: string
//   ): Promise<IPurchaseReturn> {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const [supplier, warehouse] = await Promise.all([
//         Supplier.findOne({ _id: input.supplierId, tenantId }),
//         Warehouse.findOne({ _id: input.warehouseId, tenantId }),
//       ]);
//       if (!supplier)  throw new NotFoundError('Supplier');
//       if (!warehouse) throw new NotFoundError('Warehouse');

//       let totalAmount = 0;
//       const returnItems = [];

//       for (const item of input.items) {
//         const product = await Product.findOne({ _id: item.productId, tenantId });
//         if (!product) throw new NotFoundError(`Product ${item.productId}`);

//         const itemTotal = parseFloat((item.returnQuantity * item.unitCost).toFixed(2));
//         totalAmount += itemTotal;

//         returnItems.push({
//           productId:      new Types.ObjectId(item.productId),
//           variantId:      item.variantId ? new Types.ObjectId(item.variantId) : null,
//           name:           product.name,
//           sku:            product.sku,
//           returnQuantity: item.returnQuantity,
//           unitCost:       item.unitCost,
//           total:          itemTotal,
//           reason:         item.reason,
//           notes:          item.notes,
//         });

//         // Deduct stock from warehouse
//         await stockService.adjustStock({
//           productId:   item.productId,
//           variantId:   item.variantId,
//           warehouseId: input.warehouseId,
//           quantity:    item.returnQuantity,
//           type:        'damage',           // maps to stock reduction; logged with return ref
//           costPrice:   item.unitCost,
//           referenceType: 'purchase',
//           notes:       `Purchase return to ${supplier.name}: ${item.reason}`,
//         }, tenantId, userId);
//       }

//       const returnNumber = await genReturnNumber(tenantId);
//       let poNumber: string | undefined;
//       let grnNumber: string | undefined;

//       if (input.purchaseOrderId) {
//         const po = await PurchaseOrder.findById(input.purchaseOrderId).session(session);
//         poNumber = po?.poNumber;
//       }
//       if (input.grnId) {
//         const grn = await GRN.findById(input.grnId).session(session);
//         grnNumber = grn?.grnNumber;
//       }

//       const ret = await PurchaseReturn.create([{
//         returnNumber,
//         purchaseOrderId:  input.purchaseOrderId,
//         poNumber,
//         grnId:            input.grnId,
//         grnNumber,
//         supplierId:       input.supplierId,
//         supplierName:     supplier.name,
//         warehouseId:      input.warehouseId,
//         status:           'pending',
//         items:            returnItems,
//         totalAmount,
//         refundMethod:     input.refundMethod,
//         notes:            input.notes,
//         returnedBy:       userId,
//         tenantId,
//       }], { session }).then(d => d[0]);

//       await session.commitTransaction();

//       logger.info(`Purchase return: ${returnNumber} supplier=${supplier.name} total=${totalAmount}`);
//       return PurchaseReturn.findById(ret._id)
//         .populate('supplierId', 'name')
//         .populate('warehouseId', 'name code') as Promise<IPurchaseReturn>;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       await session.endSession();
//     }
//   }

//   async getPurchaseReturns(
//     query: PaginationQuery & { supplierId?: string; status?: string; from?: string; to?: string },
//     tenantId: string
//   ): Promise<PaginatedResult<IPurchaseReturn>> {
//     const { page, limit, skip } = parsePagination(query, 'createdAt');
//     const filter: Record<string, unknown> = { tenantId };

//     if (query.supplierId) filter.supplierId = query.supplierId;
//     if (query.status)     filter.status     = query.status;
//     Object.assign(filter, buildDateRangeQuery(query.from, query.to));

//     const [data, total] = await Promise.all([
//       PurchaseReturn.find(filter)
//         .populate('supplierId', 'name')
//         .populate('warehouseId', 'name code')
//         .populate('returnedBy', 'name')
//         .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
//       PurchaseReturn.countDocuments(filter),
//     ]);
//     return { data: data as IPurchaseReturn[], pagination: buildPaginationMeta(total, page, limit) };
//   }

//   async recordCreditNote(
//     id: string,
//     input: { creditNoteNumber: string; refundAmount: number; refundMethod: IPurchaseReturn['refundMethod'] },
//     tenantId: string
//   ): Promise<IPurchaseReturn> {
//     const ret = await PurchaseReturn.findOne({ _id: id, tenantId });
//     if (!ret) throw new NotFoundError('Purchase Return');
//     if (ret.status === 'cancelled') throw new BadRequestError('Cannot update a cancelled return');

//     const updated = await PurchaseReturn.findByIdAndUpdate(id, {
//       status:           'credited',
//       creditNoteNumber: input.creditNoteNumber,
//       refundAmount:     input.refundAmount,
//       refundMethod:     input.refundMethod,
//       acknowledgedAt:   new Date(),
//     }, { new: true });

//     // Reduce supplier credit balance by refund amount
//     await Supplier.findByIdAndUpdate(ret.supplierId, { $inc: { creditBalance: -input.refundAmount } });
//     return updated!;
//   }

//   // ── Purchase Stats ───────────────────────────────────────────────────────

//   async getPurchaseStats(
//     query: { from?: string; to?: string; warehouseId?: string },
//     tenantId: string
//   ) {
//     const match: Record<string, unknown> = {
//       tenantId,
//       status: { $nin: ['cancelled'] },
//     };
//     if (query.warehouseId) match.warehouseId = new Types.ObjectId(query.warehouseId);
//     Object.assign(match, buildDateRangeQuery(query.from, query.to, 'orderDate'));

//     const [overview, byStatus, topSuppliers, pendingPOs, overduePayments] = await Promise.all([
//       PurchaseOrder.aggregate([
//         { $match: match },
//         { $group: {
//           _id:           null,
//           totalOrders:   { $sum: 1 },
//           totalValue:    { $sum: '$total' },
//           totalPaid:     { $sum: '$amountPaid' },
//           totalDue:      { $sum: '$amountDue' },
//           avgOrderValue: { $avg: '$total' },
//         }},
//       ]),
//       PurchaseOrder.aggregate([
//         { $match: match },
//         { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
//       ]),
//       PurchaseOrder.aggregate([
//         { $match: match },
//         { $group: { _id: '$supplierId', supplierName: { $first: '$supplierName' }, orders: { $sum: 1 }, value: { $sum: '$total' } } },
//         { $sort: { value: -1 } },
//         { $limit: 5 },
//       ]),
//       PurchaseOrder.find({ tenantId, status: { $in: ['sent', 'acknowledged', 'partial'] } })
//         .select('poNumber supplierName total amountDue expectedDate status')
//         .sort({ expectedDate: 1 }).limit(10).lean(),
//       PurchaseOrder.find({ tenantId, paymentStatus: 'overdue', status: { $nin: ['cancelled', 'closed'] } })
//         .select('poNumber supplierName total amountDue expectedDate')
//         .sort({ amountDue: -1 }).limit(10).lean(),
//     ]);

//     return {
//       overview: overview[0] ?? { totalOrders: 0, totalValue: 0, totalPaid: 0, totalDue: 0, avgOrderValue: 0 },
//       byStatus:  byStatus.reduce<Record<string, { count: number; total: number }>>((acc, s) => {
//         acc[s._id as string] = { count: s.count as number, total: s.total as number };
//         return acc;
//       }, {}),
//       topSuppliers,
//       pendingPOs,
//       overduePayments,
//     };
//   }
// }

// export const purchaseService = new PurchaseService();
