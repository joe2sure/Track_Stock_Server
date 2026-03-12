import Brand, { IBrand } from './brand.model';
import {
  parsePagination, buildPaginationMeta, buildSearchQuery,
} from '../../shared/utils/pagination';
import { deleteCache, CachePrefix } from '../../shared/utils/cache';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import slugify from 'slugify';

export class BrandService {
  async getBrands(
    query: PaginationQuery & { isActive?: string },
    tenantId: string
  ): Promise<PaginatedResult<IBrand>> {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter: Record<string, unknown> = { tenantId };
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['name', 'description', 'country']));

    const [data, total] = await Promise.all([
      Brand.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Brand.countDocuments(filter),
    ]);
    return { data: data as IBrand[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getBrandById(id: string, tenantId: string): Promise<IBrand> {
    const brand = await Brand.findOne({ _id: id, tenantId });
    if (!brand) throw new NotFoundError('Brand');
    return brand;
  }

  async createBrand(
    input: Partial<IBrand>,
    tenantId: string,
    userId: string
  ): Promise<IBrand> {
    if (!input.name) throw new BadRequestError('Brand name is required');
    const slug = slugify(input.name, { lower: true, strict: true });
    const exists = await Brand.findOne({ slug, tenantId });
    if (exists) throw new ConflictError(`Brand "${input.name}" already exists`);
    return Brand.create({ ...input, slug, tenantId, createdBy: userId });
  }

  async updateBrand(
    id: string,
    input: Partial<IBrand>,
    tenantId: string
  ): Promise<IBrand> {
    const brand = await Brand.findOne({ _id: id, tenantId });
    if (!brand) throw new NotFoundError('Brand');

    if (input.name && input.name !== brand.name) {
      const newSlug = slugify(input.name, { lower: true, strict: true });
      const conflict = await Brand.findOne({ slug: newSlug, tenantId, _id: { $ne: id } });
      if (conflict) throw new ConflictError(`Brand "${input.name}" already exists`);
      (input as Record<string, unknown>).slug = newSlug;
    }

    const updated = await Brand.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!updated) throw new NotFoundError('Brand');
    return updated;
  }

  async deleteBrand(id: string, tenantId: string): Promise<void> {
    const brand = await Brand.findOne({ _id: id, tenantId });
    if (!brand) throw new NotFoundError('Brand');
    if (brand.productCount > 0)
      throw new BadRequestError(`Cannot delete: brand has ${brand.productCount} product(s)`);
    await Brand.findByIdAndDelete(id);
  }

  async getBrandStats(tenantId: string) {
    const [total, active] = await Promise.all([
      Brand.countDocuments({ tenantId }),
      Brand.countDocuments({ tenantId, isActive: true }),
    ]);
    const topBrands = await Brand.find({ tenantId })
      .sort({ productCount: -1 })
      .limit(5)
      .select('name productCount logo')
      .lean();
    return { total, active, inactive: total - active, topBrands };
  }
}

export const brandService = new BrandService();
