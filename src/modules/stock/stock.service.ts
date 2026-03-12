import mongoose, { Types } from "mongoose";
import StockLevel, { IStockLevel } from "./stockLevel.model";
import StockMovement, {
  IStockMovement,
  MovementType,
} from "./stockMovement.model";
import StockTransfer, {
  IStockTransfer,
  TransferStatus,
} from "./stockTransfer.model";
import Product from "../products/product.model";
import Warehouse from "../warehouses/warehouse.model";
import {
  parsePagination,
  buildPaginationMeta,
  buildDateRangeQuery,
} from "../../shared/utils/pagination";
import { NotFoundError, BadRequestError } from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";
import { emitToTenant } from "../../server";
import logger from "../../config/logger";

// ── Direction lookup ─────────────────────────────────────────────────────────
const INBOUND: MovementType[] = [
  "purchase_receipt",
  "sale_return",
  "transfer_in",
  "adjustment_add",
  "initial_stock",
  "recount",
  "production_output",
];
function dir(type: MovementType): "in" | "out" {
  return INBOUND.includes(type) ? "in" : "out";
}

// ── Transfer number ──────────────────────────────────────────────────────────
function genTRF(): string {
  const d = new Date();
  return `TRF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
}

// ── Input types ──────────────────────────────────────────────────────────────
interface AdjustInput {
  productId: string;
  variantId?: string;
  warehouseId: string;
  quantity: number;
  type: MovementType;
  costPrice?: number;
  referenceType?: IStockMovement["referenceType"];
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  batchNumber?: string;
  expiryDate?: Date;
}

export class StockService {
  // ── Core: atomic stock adjustment ─────────────────────────────────────────
  async adjustStock(
    input: AdjustInput,
    tenantId: string,
    userId: string,
  ): Promise<{ stockLevel: IStockLevel; movement: IStockMovement }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        productId,
        variantId,
        warehouseId,
        quantity,
        type,
        costPrice,
        referenceType,
        referenceId,
        referenceNumber,
        notes,
        batchNumber,
        expiryDate,
      } = input;

      if (quantity <= 0)
        throw new BadRequestError("Quantity must be greater than 0");

      const [product, warehouse] = await Promise.all([
        Product.findOne({ _id: productId, tenantId }),
        Warehouse.findOne({ _id: warehouseId, tenantId }),
      ]);
      if (!product) throw new NotFoundError("Product");
      if (!warehouse) throw new NotFoundError("Warehouse");

      const direction = dir(type);

      // Find or create StockLevel record
      let sl = await StockLevel.findOne({
        productId,
        variantId: variantId ?? null,
        warehouseId,
        tenantId,
      }).session(session);

      if (!sl) {
        const created = await StockLevel.create(
          [
            {
              productId,
              variantId: variantId ?? null,
              warehouseId,
              tenantId,
              quantity: 0,
              reservedQuantity: 0,
              minStockLevel: product.minStockLevel ?? 0,
              costPrice: costPrice ?? product.costPrice ?? 0,
            },
          ],
          { session },
        );
        sl = created[0];
      }

      const before = sl.quantity;
      let after: number;

      if (direction === "in") {
        after = before + quantity;
      } else {
        if (before < quantity) {
          throw new BadRequestError(
            `Insufficient stock for "${product.name}". Available: ${before}, Requested: ${quantity}`,
          );
        }
        after = before - quantity;
      }

      const resolvedCost = costPrice ?? sl.costPrice ?? product.costPrice;

      await StockLevel.findByIdAndUpdate(
        sl._id,
        {
          quantity: after,
          ...(direction === "in" && { costPrice: resolvedCost }),
          ...(batchNumber && { batchNumber }),
          ...(expiryDate && { expiryDate }),
        },
        { session },
      );

      const movement = await StockMovement.create(
        [
          {
            productId,
            variantId: variantId ?? null,
            warehouseId,
            type,
            direction,
            quantity,
            quantityBefore: before,
            quantityAfter: after,
            costPrice: resolvedCost,
            totalCost: resolvedCost * quantity,
            referenceType,
            referenceId: referenceId
              ? new Types.ObjectId(referenceId)
              : undefined,
            referenceNumber,
            notes,
            batchNumber,
            expiryDate,
            performedBy: userId,
            tenantId,
          },
        ],
        { session },
      ).then((d) => d[0]);

      // Sync product aggregate stock
      const agg = await StockLevel.aggregate([
        { $match: { productId: new Types.ObjectId(productId), tenantId } },
        { $group: { _id: null, total: { $sum: "$quantity" } } },
      ]).session(session);
      await Product.findByIdAndUpdate(
        productId,
        { stockQuantity: agg[0]?.total ?? after },
        { session },
      );

      await session.commitTransaction();

      const updated = (await StockLevel.findById(sl._id))!;

      if (direction === "out" && updated.quantity <= updated.minStockLevel) {
        emitToTenant(tenantId, "low_stock_alert", {
          productId,
          productName: product.name,
          sku: product.sku,
          warehouseId,
          warehouseName: warehouse.name,
          current: updated.quantity,
          minimum: updated.minStockLevel,
        });
      }

      logger.info(
        `Stock [${type}] ${product.sku} qty=${quantity} wh=${warehouse.code} by=${userId}`,
      );
      return { stockLevel: updated, movement };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ── Reserve / release ───────────────────────────────────────────────────────
  async reserveStock(
    productId: string,
    warehouseId: string,
    qty: number,
    tenantId: string,
  ): Promise<void> {
    const sl = await StockLevel.findOne({ productId, warehouseId, tenantId });
    if (!sl) throw new NotFoundError("Stock level");
    const avail = sl.quantity - sl.reservedQuantity;
    if (avail < qty)
      throw new BadRequestError(`Cannot reserve ${qty}. Available: ${avail}`);
    await StockLevel.findByIdAndUpdate(sl._id, {
      $inc: { reservedQuantity: qty },
    });
  }

  async releaseReservation(
    productId: string,
    warehouseId: string,
    qty: number,
    tenantId: string,
  ): Promise<void> {
    await StockLevel.findOneAndUpdate(
      { productId, warehouseId, tenantId },
      { $inc: { reservedQuantity: -qty } },
    );
  }

  // ── Stock levels ─────────────────────────────────────────────────────────────
  async getStockLevels(
    query: PaginationQuery & {
      warehouseId?: string;
      productId?: string;
      stockStatus?: string;
    },
    tenantId: string,
  ): Promise<PaginatedResult<IStockLevel>> {
    const { page, limit, skip, sort } = parsePagination(query, "quantity");
    const filter: Record<string, unknown> = { tenantId };
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.productId) filter.productId = query.productId;
    if (query.stockStatus === "out_of_stock") {
      filter.quantity = 0;
    } else if (query.stockStatus === "low_stock") {
      filter.$expr = {
        $and: [
          { $gt: ["$quantity", 0] },
          { $lte: ["$quantity", "$minStockLevel"] },
        ],
      };
    }

    const [data, total] = await Promise.all([
      StockLevel.find(filter)
        .populate("productId", "name sku barcode images status")
        .populate("warehouseId", "name code city")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      StockLevel.countDocuments(filter),
    ]);
    return {
      data: data as IStockLevel[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getProductStock(
    productId: string,
    tenantId: string,
  ): Promise<IStockLevel[]> {
    return StockLevel.find({ productId, tenantId })
      .populate("warehouseId", "name code city isActive")
      .lean() as Promise<IStockLevel[]>;
  }

  // ── Inventory valuation ───────────────────────────────────────────────────────
  async getInventoryValuation(
    query: { warehouseId?: string; categoryId?: string },
    tenantId: string,
  ) {
    const match: Record<string, unknown> = { tenantId };
    if (query.warehouseId)
      match.warehouseId = new Types.ObjectId(query.warehouseId);

    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      ...(query.categoryId
        ? [
            {
              $match: {
                "product.categoryId": new Types.ObjectId(query.categoryId),
              },
            } as mongoose.PipelineStage,
          ]
        : []),
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalCostValue: { $sum: { $multiply: ["$quantity", "$costPrice"] } },
          totalRetailValue: {
            $sum: { $multiply: ["$quantity", "$product.sellingPrice"] },
          },
          potentialProfit: {
            $sum: {
              $multiply: [
                "$quantity",
                { $subtract: ["$product.sellingPrice", "$costPrice"] },
              ],
            },
          },
        },
      },
    ];

    const r = await StockLevel.aggregate(pipeline);
    return (
      r[0] ?? {
        totalProducts: 0,
        totalQuantity: 0,
        totalCostValue: 0,
        totalRetailValue: 0,
        potentialProfit: 0,
      }
    );
  }

  // ── Movement history ──────────────────────────────────────────────────────────
  async getMovements(
    query: PaginationQuery & {
      productId?: string;
      warehouseId?: string;
      type?: string;
      from?: string;
      to?: string;
    },
    tenantId: string,
  ): Promise<PaginatedResult<IStockMovement>> {
    const { page, limit, skip } = parsePagination(query, "createdAt");
    const filter: Record<string, unknown> = { tenantId };
    if (query.productId) filter.productId = query.productId;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.type) filter.type = query.type;
    Object.assign(filter, buildDateRangeQuery(query.from, query.to));

    const [data, total] = await Promise.all([
      StockMovement.find(filter)
        .populate("productId", "name sku")
        .populate("warehouseId", "name code")
        .populate("performedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(filter),
    ]);
    return {
      data: data as IStockMovement[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Transfers ─────────────────────────────────────────────────────────────────
  async createTransfer(
    input: {
      fromWarehouseId: string;
      toWarehouseId: string;
      items: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
        notes?: string;
      }>;
      notes?: string;
      expectedDate?: Date;
    },
    tenantId: string,
    userId: string,
  ): Promise<IStockTransfer> {
    if (input.fromWarehouseId === input.toWarehouseId)
      throw new BadRequestError("Source and destination must be different");

    const [from, to] = await Promise.all([
      Warehouse.findOne({ _id: input.fromWarehouseId, tenantId }),
      Warehouse.findOne({ _id: input.toWarehouseId, tenantId }),
    ]);
    if (!from) throw new NotFoundError("Source warehouse");
    if (!to) throw new NotFoundError("Destination warehouse");
    if (!input.items.length)
      throw new BadRequestError("Must include at least one item");

    const enriched = [];
    for (const item of input.items) {
      const product = await Product.findOne({ _id: item.productId, tenantId });
      if (!product) throw new NotFoundError(`Product ${item.productId}`);

      const sl = await StockLevel.findOne({
        productId: item.productId,
        variantId: item.variantId ?? null,
        warehouseId: input.fromWarehouseId,
        tenantId,
      });
      const avail = sl ? sl.quantity - sl.reservedQuantity : 0;
      if (avail < item.quantity)
        throw new BadRequestError(
          `Insufficient stock for "${product.name}". Available: ${avail}, Requested: ${item.quantity}`,
        );

      enriched.push({
        productId: new Types.ObjectId(item.productId),
        variantId: item.variantId ? new Types.ObjectId(item.variantId) : null,
        requestedQuantity: item.quantity,
        dispatchedQuantity: 0,
        receivedQuantity: 0,
        costPrice: sl?.costPrice ?? product.costPrice,
        notes: item.notes,
      });
    }

    const transfer = await StockTransfer.create({
      transferNumber: genTRF(),
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      items: enriched,
      status: "pending",
      notes: input.notes,
      expectedDate: input.expectedDate,
      requestedBy: userId,
      tenantId,
    });

    logger.info(
      `Transfer created: ${transfer.transferNumber} (${from.code}→${to.code}) by ${userId}`,
    );
    emitToTenant(tenantId, "stock_transfer", {
      type: "created",
      transferNumber: transfer.transferNumber,
    });
    return transfer;
  }

  async getTransfers(
    query: PaginationQuery & {
      status?: string;
      fromWarehouseId?: string;
      toWarehouseId?: string;
      from?: string;
      to?: string;
    },
    tenantId: string,
  ): Promise<PaginatedResult<IStockTransfer>> {
    const { page, limit, skip } = parsePagination(query, "createdAt");
    const filter: Record<string, unknown> = { tenantId };
    if (query.status) filter.status = query.status;
    if (query.fromWarehouseId) filter.fromWarehouseId = query.fromWarehouseId;
    if (query.toWarehouseId) filter.toWarehouseId = query.toWarehouseId;
    Object.assign(filter, buildDateRangeQuery(query.from, query.to));

    const [data, total] = await Promise.all([
      StockTransfer.find(filter)
        .populate("fromWarehouseId", "name code")
        .populate("toWarehouseId", "name code")
        .populate("requestedBy", "name")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockTransfer.countDocuments(filter),
    ]);
    return {
      data: data as IStockTransfer[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getTransferById(id: string, tenantId: string): Promise<IStockTransfer> {
    const t = await StockTransfer.findOne({ _id: id, tenantId })
      .populate("fromWarehouseId", "name code city")
      .populate("toWarehouseId", "name code city")
      .populate("requestedBy", "name email")
      .populate("approvedBy", "name email")
      .populate("dispatchedBy", "name email")
      .populate("receivedBy", "name email")
      .populate("items.productId", "name sku images");
    if (!t) throw new NotFoundError("Transfer");
    return t;
  }

  async approveTransfer(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<IStockTransfer> {
    const t = await StockTransfer.findOne({ _id: id, tenantId });
    if (!t) throw new NotFoundError("Transfer");
    if (t.status !== "pending")
      throw new BadRequestError(`Cannot approve (status: ${t.status})`);
    const updated = await StockTransfer.findByIdAndUpdate(
      id,
      { status: "approved", approvedBy: userId, approvedAt: new Date() },
      { new: true },
    );
    emitToTenant(tenantId, "stock_transfer", {
      type: "approved",
      id,
      transferNumber: t.transferNumber,
    });
    return updated!;
  }

  async rejectTransfer(
    id: string,
    reason: string,
    tenantId: string,
    userId: string,
  ): Promise<IStockTransfer> {
    const t = await StockTransfer.findOne({ _id: id, tenantId });
    if (!t) throw new NotFoundError("Transfer");
    if (!["pending", "approved"].includes(t.status))
      throw new BadRequestError(`Cannot reject (status: ${t.status})`);
    return StockTransfer.findByIdAndUpdate(
      id,
      {
        status: "rejected",
        rejectionReason: reason,
        approvedBy: userId,
        approvedAt: new Date(),
      },
      { new: true },
    ) as Promise<IStockTransfer>;
  }

  async dispatchTransfer(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<IStockTransfer> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const t = await StockTransfer.findOne({ _id: id, tenantId }).session(
        session,
      );
      if (!t) throw new NotFoundError("Transfer");
      if (t.status !== "approved")
        throw new BadRequestError(
          "Transfer must be approved before dispatching",
        );

      for (const item of t.items) {
        await this.adjustStock(
          {
            productId: item.productId.toString(),
            variantId: item.variantId?.toString(),
            warehouseId: t.fromWarehouseId.toString(),
            quantity: item.requestedQuantity,
            type: "transfer_out",
            referenceType: "transfer",
            referenceId: t._id.toString(),
            referenceNumber: t.transferNumber,
          },
          tenantId,
          userId,
        );
        await StockTransfer.updateOne(
          { _id: id, "items._id": item._id },
          { $set: { "items.$.dispatchedQuantity": item.requestedQuantity } },
          { session },
        );
      }

      await StockTransfer.findByIdAndUpdate(
        id,
        {
          status: "in_transit",
          dispatchedBy: userId,
          dispatchedAt: new Date(),
        },
        { session },
      );
      await session.commitTransaction();

      const updated = await this.getTransferById(id, tenantId);
      emitToTenant(tenantId, "stock_transfer", {
        type: "dispatched",
        id,
        transferNumber: t.transferNumber,
      });
      return updated;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async receiveTransfer(
    id: string,
    receivedItems: Array<{
      itemId: string;
      receivedQuantity: number;
      notes?: string;
    }>,
    tenantId: string,
    userId: string,
  ): Promise<IStockTransfer> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const t = await StockTransfer.findOne({ _id: id, tenantId }).session(
        session,
      );
      if (!t) throw new NotFoundError("Transfer");
      if (t.status !== "in_transit")
        throw new BadRequestError("Transfer must be in transit to receive");

      let allReceived = true;
      for (const recv of receivedItems) {
        const item = t.items.find((i) => i._id?.toString() === recv.itemId);
        if (!item) continue;
        if (recv.receivedQuantity > item.dispatchedQuantity)
          throw new BadRequestError(
            `Received qty exceeds dispatched for item ${recv.itemId}`,
          );

        await this.adjustStock(
          {
            productId: item.productId.toString(),
            variantId: item.variantId?.toString(),
            warehouseId: t.toWarehouseId.toString(),
            quantity: recv.receivedQuantity,
            type: "transfer_in",
            costPrice: item.costPrice,
            referenceType: "transfer",
            referenceId: t._id.toString(),
            referenceNumber: t.transferNumber,
            notes: recv.notes,
          },
          tenantId,
          userId,
        );

        await StockTransfer.updateOne(
          { _id: id, "items._id": item._id },
          { $set: { "items.$.receivedQuantity": recv.receivedQuantity } },
          { session },
        );
        if (recv.receivedQuantity < item.requestedQuantity) allReceived = false;
      }

      const newStatus: TransferStatus = allReceived ? "received" : "partial";
      await StockTransfer.findByIdAndUpdate(
        id,
        { status: newStatus, receivedBy: userId, receivedAt: new Date() },
        { session },
      );
      await session.commitTransaction();

      const updated = await this.getTransferById(id, tenantId);
      emitToTenant(tenantId, "stock_transfer", {
        type: "received",
        id,
        status: newStatus,
      });
      return updated;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async cancelTransfer(
    id: string,
    reason: string,
    tenantId: string,
    _userId: string,
  ): Promise<IStockTransfer> {
    const t = await StockTransfer.findOne({ _id: id, tenantId });
    if (!t) throw new NotFoundError("Transfer");
    if (["received", "cancelled"].includes(t.status))
      throw new BadRequestError(`Cannot cancel (status: ${t.status})`);
    if (t.status === "in_transit")
      throw new BadRequestError("Cannot cancel a transfer in transit");
    return StockTransfer.findByIdAndUpdate(
      id,
      { status: "cancelled", rejectionReason: reason },
      { new: true },
    ) as Promise<IStockTransfer>;
  }

  // ── Low stock report ───────────────────────────────────────────────────────────
  async getLowStockReport(tenantId: string, warehouseId?: string) {
    const match: Record<string, unknown> = {
      tenantId,
      $expr: { $lte: ["$quantity", "$minStockLevel"] },
    };
    if (warehouseId) match.warehouseId = new Types.ObjectId(warehouseId);
    return StockLevel.find(match)
      .populate("productId", "name sku barcode images costPrice sellingPrice")
      .populate("warehouseId", "name code")
      .sort({ quantity: 1 })
      .lean();
  }

  // ── Stock reconciliation ───────────────────────────────────────────────────────
  async reconcileStock(
    items: Array<{
      productId: string;
      warehouseId: string;
      actualQuantity: number;
      notes?: string;
    }>,
    tenantId: string,
    userId: string,
  ): Promise<{ adjusted: number; noChange: number; errors: string[] }> {
    let adjusted = 0,
      noChange = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const sl = await StockLevel.findOne({
          productId: item.productId,
          warehouseId: item.warehouseId,
          tenantId,
        });
        if (!sl) {
          if (item.actualQuantity > 0) {
            await this.adjustStock(
              {
                productId: item.productId,
                warehouseId: item.warehouseId,
                quantity: item.actualQuantity,
                type: "initial_stock",
                notes: item.notes ?? "Physical count",
              },
              tenantId,
              userId,
            );
            adjusted++;
          }
          continue;
        }
        if (sl.quantity === item.actualQuantity) {
          noChange++;
          continue;
        }

        const diff = item.actualQuantity - sl.quantity;
        await this.adjustStock(
          {
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: Math.abs(diff),
            type: diff > 0 ? "adjustment_add" : "adjustment_remove",
            notes:
              item.notes ??
              `Reconcile (system:${sl.quantity}, actual:${item.actualQuantity})`,
          },
          tenantId,
          userId,
        );
        adjusted++;
      } catch (err) {
        errors.push(`Product ${item.productId}: ${(err as Error).message}`);
      }
    }

    logger.info(
      `Reconcile: ${adjusted} adjusted, ${noChange} unchanged, ${errors.length} errors`,
    );
    return { adjusted, noChange, errors };
  }

  // ── Dashboard summary ─────────────────────────────────────────────────────────
  async getStockSummary(tenantId: string) {
    const [overview, topLow, recentMovements, transferStats] =
      await Promise.all([
        StockLevel.aggregate([
          { $match: { tenantId } },
          {
            $group: {
              _id: null,
              totalSKUs: { $sum: 1 },
              totalQty: { $sum: "$quantity" },
              outOfStock: {
                $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] },
              },
              lowStock: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$quantity", 0] },
                        { $lte: ["$quantity", "$minStockLevel"] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              totalCostValue: {
                $sum: { $multiply: ["$quantity", "$costPrice"] },
              },
            },
          },
        ]),
        StockLevel.find({
          tenantId,
          $expr: { $lte: ["$quantity", "$minStockLevel"] },
        })
          .populate("productId", "name sku")
          .populate("warehouseId", "name code")
          .sort({ quantity: 1 })
          .limit(5)
          .lean(),
        StockMovement.find({ tenantId })
          .populate("productId", "name sku")
          .populate("performedBy", "name")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        StockTransfer.aggregate([
          { $match: { tenantId } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    return {
      overview: overview[0] ?? {
        totalSKUs: 0,
        totalQty: 0,
        outOfStock: 0,
        lowStock: 0,
        totalCostValue: 0,
      },
      topLowStockItems: topLow,
      recentMovements,
      transfersByStatus: transferStats.reduce<Record<string, number>>(
        (acc, s) => {
          acc[s._id as string] = s.count as number;
          return acc;
        },
        {},
      ),
    };
  }
}

export const stockService = new StockService();
