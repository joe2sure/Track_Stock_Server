import Variation, { IVariation, IVariationOption } from "./variation.model";
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
import slugify from "slugify";

export class VariationService {
  async getVariations(
    query: PaginationQuery & { isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<IVariation>> {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter: Record<string, unknown> = { tenantId };
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.search)
      Object.assign(filter, buildSearchQuery(query.search, ["name"]));

    const [data, total] = await Promise.all([
      Variation.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Variation.countDocuments(filter),
    ]);
    return {
      data: data as IVariation[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async getVariationById(id: string, tenantId: string): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");
    return v;
  }

  async createVariation(
    input: {
      name: string;
      type?: string;
      options?: IVariationOption[];
      isActive?: boolean;
    },
    tenantId: string,
    userId: string,
  ): Promise<IVariation> {
    const slug = slugify(input.name, { lower: true, strict: true });
    const exists = await Variation.findOne({ slug, tenantId });
    if (exists)
      throw new ConflictError(`Variation "${input.name}" already exists`);

    return Variation.create({ ...input, slug, tenantId, createdBy: userId });
  }

  async updateVariation(
    id: string,
    input: Partial<IVariation>,
    tenantId: string,
  ): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");

    if (typeof input.name === "string" && input.name !== v.name) {
      const newSlug = slugify(input.name, { lower: true, strict: true });
      const conflict = await Variation.findOne({
        slug: newSlug,
        tenantId,
        _id: { $ne: id },
      });
      if (conflict)
        throw new ConflictError(`Variation "${input.name}" already exists`);
      (input as Record<string, unknown>).slug = newSlug;
    }

    const updated = await Variation.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new NotFoundError("Variation");
    return updated;
  }

  async deleteVariation(id: string, tenantId: string): Promise<void> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");
    await Variation.findByIdAndDelete(id);
  }

  // Option management
  async addOption(
    id: string,
    option: IVariationOption,
    tenantId: string,
  ): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");

    const exists = v.options.some(
      (o) => o.value.toLowerCase() === option.value.toLowerCase(),
    );
    if (exists)
      throw new ConflictError(`Option "${option.value}" already exists`);

    v.options.push(option);
    await v.save();
    return v;
  }

  async updateOption(
    id: string,
    optionId: string,
    input: Partial<IVariationOption>,
    tenantId: string,
  ): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");

    const idx = v.options.findIndex((o) => o._id?.toString() === optionId);
    if (idx === -1) throw new NotFoundError("Option");

    Object.assign(v.options[idx], input);
    await v.save();
    return v;
  }

  async deleteOption(
    id: string,
    optionId: string,
    tenantId: string,
  ): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");
    v.options = v.options.filter((o) => o._id?.toString() !== optionId);
    await v.save();
    return v;
  }

  async reorderOptions(
    id: string,
    orderedIds: string[],
    tenantId: string,
  ): Promise<IVariation> {
    const v = await Variation.findOne({ _id: id, tenantId });
    if (!v) throw new NotFoundError("Variation");

    const sorted = orderedIds
      .map((oid, idx) => {
        const opt = v.options.find((o) => o._id?.toString() === oid);
        if (opt) opt.sortOrder = idx;
        return opt;
      })
      .filter(Boolean) as IVariationOption[];

    v.options = sorted;
    await v.save();
    return v;
  }
}

export const variationService = new VariationService();
