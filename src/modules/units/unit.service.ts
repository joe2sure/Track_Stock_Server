import Unit, { IUnit } from "./unit.model";
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

export class UnitService {
  async getUnits(
    query: PaginationQuery & { type?: string; isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<IUnit>> {
    const { page, limit, skip, sort } = parsePagination(query, "name");
    const filter: Record<string, unknown> = { tenantId };
    if (query.type) filter.type = query.type;
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.search)
      Object.assign(
        filter,
        buildSearchQuery(query.search, ["name", "abbreviation"]),
      );

    const [data, total] = await Promise.all([
      Unit.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Unit.countDocuments(filter),
    ]);
    return {
      data: data as IUnit[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getUnitById(id: string, tenantId: string): Promise<IUnit> {
    const unit = await Unit.findOne({ _id: id, tenantId });
    if (!unit) throw new NotFoundError("Unit");
    return unit;
  }

  async createUnit(
    input: Partial<IUnit>,
    tenantId: string,
    userId: string,
  ): Promise<IUnit> {
    if (!input.abbreviation)
      throw new BadRequestError("Abbreviation is required");
    const exists = await Unit.findOne({
      abbreviation: input.abbreviation,
      tenantId,
    });
    if (exists)
      throw new ConflictError(`Unit "${input.abbreviation}" already exists`);
    return Unit.create({ ...input, tenantId, createdBy: userId });
  }

  async updateUnit(
    id: string,
    input: Partial<IUnit>,
    tenantId: string,
  ): Promise<IUnit> {
    const unit = await Unit.findOne({ _id: id, tenantId });
    if (!unit) throw new NotFoundError("Unit");

    if (input.abbreviation && input.abbreviation !== unit.abbreviation) {
      const conflict = await Unit.findOne({
        abbreviation: input.abbreviation,
        tenantId,
        _id: { $ne: id },
      });
      if (conflict)
        throw new ConflictError(
          `Abbreviation "${input.abbreviation}" already in use`,
        );
    }

    const updated = await Unit.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new NotFoundError("Unit");
    return updated;
  }

  async deleteUnit(id: string, tenantId: string): Promise<void> {
    const unit = await Unit.findOne({ _id: id, tenantId });
    if (!unit) throw new NotFoundError("Unit");
    if (unit.productCount > 0)
      throw new BadRequestError(
        `Cannot delete: unit is used by ${unit.productCount} product(s)`,
      );
    await Unit.findByIdAndDelete(id);
  }

  async getUnitsByType(tenantId: string) {
    const units = await Unit.find({ tenantId, isActive: true })
      .sort({ type: 1, name: 1 })
      .lean();
    const grouped: Record<string, IUnit[]> = {};
    for (const u of units) {
      if (!grouped[u.type]) grouped[u.type] = [];
      grouped[u.type].push(u as IUnit);
    }
    return grouped;
  }

  // Seed default units for a new tenant
  async seedDefaults(tenantId: string, userId: string): Promise<void> {
    const defaults: Partial<IUnit>[] = [
      { name: "Piece", abbreviation: "pcs", type: "count", isBase: true },
      {
        name: "Dozen",
        abbreviation: "dz",
        type: "count",
        conversionFactor: 12,
      },
      {
        name: "Carton",
        abbreviation: "ctn",
        type: "count",
        conversionFactor: 12,
      },
      { name: "Kilogram", abbreviation: "kg", type: "weight", isBase: true },
      {
        name: "Gram",
        abbreviation: "g",
        type: "weight",
        baseUnit: "kg",
        conversionFactor: 0.001,
      },
      {
        name: "Tonne",
        abbreviation: "t",
        type: "weight",
        baseUnit: "kg",
        conversionFactor: 1000,
      },
      {
        name: "Pound",
        abbreviation: "lb",
        type: "weight",
        baseUnit: "kg",
        conversionFactor: 0.453592,
      },
      { name: "Litre", abbreviation: "L", type: "volume", isBase: true },
      {
        name: "Millilitre",
        abbreviation: "mL",
        type: "volume",
        baseUnit: "L",
        conversionFactor: 0.001,
      },
      {
        name: "Centilitre",
        abbreviation: "cL",
        type: "volume",
        baseUnit: "L",
        conversionFactor: 0.01,
      },
      { name: "Metre", abbreviation: "m", type: "length", isBase: true },
      {
        name: "Centimetre",
        abbreviation: "cm",
        type: "length",
        baseUnit: "m",
        conversionFactor: 0.01,
      },
      {
        name: "Millimetre",
        abbreviation: "mm",
        type: "length",
        baseUnit: "m",
        conversionFactor: 0.001,
      },
    ];

    for (const u of defaults) {
      await Unit.findOneAndUpdate(
        { abbreviation: u.abbreviation, tenantId },
        { ...u, tenantId, createdBy: userId },
        { upsert: true, new: true },
      );
    }
  }
}

export const unitService = new UnitService();
