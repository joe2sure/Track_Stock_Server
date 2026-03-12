import Supplier, { ISupplier } from "./supplier.model";
import {
  parsePagination,
  buildPaginationMeta,
  buildSearchQuery,
} from "../../shared/utils/pagination";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";

function generateSupplierNumber(): string {
  return `SUP-${Date.now().toString(36).toUpperCase()}`;
}

export class SupplierService {
  async getSuppliers(
    query: PaginationQuery & { isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<ISupplier>> {
    const { page, limit, skip, sort } = parsePagination(query, "name");
    const filter: Record<string, unknown> = { tenantId };
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.search)
      Object.assign(
        filter,
        buildSearchQuery(query.search, [
          "name",
          "contactPerson",
          "phone",
          "email",
          "supplierNumber",
        ]),
      );

    const [data, total] = await Promise.all([
      Supplier.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
    ]);
    return {
      data: data as ISupplier[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getSupplierById(id: string, tenantId: string): Promise<ISupplier> {
    const s = await Supplier.findOne({ _id: id, tenantId });
    if (!s) throw new NotFoundError("Supplier");
    return s;
  }

  async createSupplier(
    input: Partial<ISupplier>,
    tenantId: string,
    userId: string,
  ): Promise<ISupplier> {
    if (input.phone) {
      const exists = await Supplier.findOne({ phone: input.phone, tenantId });
      if (exists)
        throw new ConflictError(
          `Supplier with phone "${input.phone}" already exists`,
        );
    }
    return Supplier.create({
      ...input,
      supplierNumber: generateSupplierNumber(),
      tenantId,
      createdBy: userId,
    });
  }

  async updateSupplier(
    id: string,
    input: Partial<ISupplier>,
    tenantId: string,
  ): Promise<ISupplier> {
    const s = await Supplier.findOneAndUpdate({ _id: id, tenantId }, input, {
      new: true,
      runValidators: true,
    });
    if (!s) throw new NotFoundError("Supplier");
    return s;
  }

  async deleteSupplier(id: string, tenantId: string): Promise<void> {
    const s = await Supplier.findOne({ _id: id, tenantId });
    if (!s) throw new NotFoundError("Supplier");
    if (s.totalOrders > 0)
      throw new BadRequestError("Cannot delete supplier with purchase history");
    await Supplier.findByIdAndDelete(id);
  }

  async getSupplierStats(tenantId: string) {
    const [total, active, withBalance] = await Promise.all([
      Supplier.countDocuments({ tenantId }),
      Supplier.countDocuments({ tenantId, isActive: true }),
      Supplier.countDocuments({ tenantId, creditBalance: { $gt: 0 } }),
    ]);
    const totalPayable = await Supplier.aggregate([
      { $match: { tenantId } },
      { $group: { _id: null, total: { $sum: "$creditBalance" } } },
    ]);
    const topSuppliers = await Supplier.find({ tenantId })
      .sort({ totalPurchased: -1 })
      .limit(5)
      .select("name supplierNumber totalOrders totalPurchased")
      .lean();

    return {
      total,
      active,
      inactive: total - active,
      withBalance,
      totalPayable: totalPayable[0]?.total ?? 0,
      topSuppliers,
    };
  }
}

export const supplierService = new SupplierService();
