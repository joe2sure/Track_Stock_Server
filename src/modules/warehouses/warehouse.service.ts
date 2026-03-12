import Warehouse, { IWarehouse } from "./warehouse.model";
import {
  parsePagination,
  buildPaginationMeta,
  buildSearchQuery,
} from "../../shared/utils/pagination";
import { getOrSet, deleteCache, CachePrefix } from "../../shared/utils/cache";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";
// StockLevel imported lazily to avoid circular deps
import mongoose from "mongoose";

export class WarehouseService {
  async getWarehouses(
    query: PaginationQuery & { isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<IWarehouse>> {
    const { page, limit, skip, sort } = parsePagination(query, "name");
    const filter: Record<string, unknown> = { tenantId };
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.search)
      Object.assign(
        filter,
        buildSearchQuery(query.search, ["name", "code", "city", "state"]),
      );

    const [data, total] = await Promise.all([
      Warehouse.find(filter)
        .populate("managerId", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Warehouse.countDocuments(filter),
    ]);
    return {
      data: data as IWarehouse[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getWarehouseById(id: string, tenantId: string): Promise<IWarehouse> {
    const wh = await Warehouse.findOne({ _id: id, tenantId }).populate(
      "managerId",
      "name email phone",
    );
    if (!wh) throw new NotFoundError("Warehouse");
    return wh;
  }

  async getDefaultWarehouse(tenantId: string): Promise<IWarehouse> {
    return getOrSet(
      `default:${tenantId}`,
      async () => {
        const wh = await Warehouse.findOne({
          tenantId,
          isDefault: true,
          isActive: true,
        });
        if (!wh) {
          const first = await Warehouse.findOne({ tenantId, isActive: true });
          if (!first) throw new NotFoundError("No warehouse configured");
          return first;
        }
        return wh;
      },
      { prefix: CachePrefix.WAREHOUSES, ttl: 600 },
    );
  }

  async createWarehouse(
    input: Partial<IWarehouse>,
    tenantId: string,
    userId: string,
  ): Promise<IWarehouse> {
    if (!input.code) throw new BadRequestError("Code required");
    const exists = await Warehouse.findOne({
      code: input.code.toUpperCase(),
      tenantId,
    });
    if (exists) throw new ConflictError(`Code "${input.code}" already exists`);

    const count = await Warehouse.countDocuments({ tenantId });
    if (count === 0) input.isDefault = true;

    const wh = await Warehouse.create({
      ...input,
      tenantId,
      createdBy: userId,
    });
    await deleteCache(`default:${tenantId}`, CachePrefix.WAREHOUSES);
    return wh;
  }

  async updateWarehouse(
    id: string,
    input: Partial<IWarehouse>,
    tenantId: string,
  ): Promise<IWarehouse> {
    const wh = await Warehouse.findOne({ _id: id, tenantId });
    if (!wh) throw new NotFoundError("Warehouse");

    if (input.code && input.code.toUpperCase() !== wh.code) {
      const conflict = await Warehouse.findOne({
        code: input.code.toUpperCase(),
        tenantId,
        _id: { $ne: id },
      });
      if (conflict)
        throw new ConflictError(`Code "${input.code}" already in use`);
      input.code = input.code.toUpperCase();
    }

    const updated = await Warehouse.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new NotFoundError("Warehouse");
    await deleteCache(`default:${tenantId}`, CachePrefix.WAREHOUSES);
    return updated;
  }

  async setDefault(id: string, tenantId: string): Promise<IWarehouse> {
    await Warehouse.updateMany({ tenantId }, { isDefault: false });
    const wh = await Warehouse.findOneAndUpdate(
      { _id: id, tenantId },
      { isDefault: true },
      { new: true },
    );
    if (!wh) throw new NotFoundError("Warehouse");
    await deleteCache(`default:${tenantId}`, CachePrefix.WAREHOUSES);
    return wh;
  }

  async deleteWarehouse(id: string, tenantId: string): Promise<void> {
    const wh = await Warehouse.findOne({ _id: id, tenantId });
    if (!wh) throw new NotFoundError("Warehouse");
    if (wh.isDefault)
      throw new BadRequestError("Cannot delete the default warehouse");

    const StockLevel = mongoose.model("StockLevel");
    const stockCount = await StockLevel.countDocuments({
      warehouseId: id,
      tenantId,
      quantity: { $gt: 0 },
    });
    if (stockCount > 0)
      throw new BadRequestError(
        `Warehouse has ${stockCount} products in stock`,
      );

    await Warehouse.findByIdAndDelete(id);
  }

  async getWarehouseStats(tenantId: string) {
    const warehouses = await Warehouse.find({
      tenantId,
      isActive: true,
    }).lean();
    const StockLevel = mongoose.model("StockLevel");
    const stockByWH = await StockLevel.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: "$warehouseId",
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: { $multiply: ["$quantity", "$costPrice"] } },
        },
      },
    ]);
    const stockMap = new Map(
      stockByWH.map(
        (s: {
          _id: unknown;
          totalProducts: number;
          totalQuantity: number;
          totalValue: number;
        }) => [s._id!.toString(), s],
      ),
    );
    return warehouses.map((wh) => ({
      ...wh,
      stock: stockMap.get(wh._id.toString()) ?? {
        totalProducts: 0,
        totalQuantity: 0,
        totalValue: 0,
      },
    }));
  }
}

export const warehouseService = new WarehouseService();
