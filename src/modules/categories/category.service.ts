import Category, { ICategory } from "./category.model";
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
import slugify from "slugify";

interface CreateCategoryInput {
  name: string;
  description?: string;
  image?: string;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export class CategoryService {
  // ── List categories ────────────────────────────────────────────────────────
  async getCategories(
    query: PaginationQuery & { parentId?: string; isActive?: string },
    tenantId: string,
  ): Promise<PaginatedResult<ICategory>> {
    const { page, limit, skip, sort } = parsePagination(query, "sortOrder");

    const filter: Record<string, unknown> = { tenantId };
    if (query.isActive !== undefined)
      filter.isActive = query.isActive === "true";
    if (query.parentId === "null" || query.parentId === "root")
      filter.parentId = null;
    else if (query.parentId) filter.parentId = query.parentId;

    if (query.search)
      Object.assign(
        filter,
        buildSearchQuery(query.search, ["name", "description"]),
      );

    const [data, total] = await Promise.all([
      Category.find(filter)
        .populate("parentId", "name slug")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Category.countDocuments(filter),
    ]);

    return {
      data: data as ICategory[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Tree (hierarchical) ────────────────────────────────────────────────────
  async getCategoryTree(tenantId: string): Promise<ICategory[]> {
    return getOrSet(
      `tree:${tenantId}`,
      async () => {
        const all = await Category.find({ tenantId, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .lean();

        const map = new Map<string, ICategory & { children: ICategory[] }>();
        const roots: (ICategory & { children: ICategory[] })[] = [];

        for (const cat of all) {
          (cat as ICategory & { children: ICategory[] }).children = [];
          map.set(
            cat._id.toString(),
            cat as ICategory & { children: ICategory[] },
          );
        }

        for (const cat of all) {
          if (cat.parentId) {
            const parent = map.get(cat.parentId.toString());
            parent?.children.push(cat as ICategory);
          } else {
            roots.push(cat as ICategory & { children: ICategory[] });
          }
        }

        return roots as unknown as ICategory[];
      },
      { prefix: CachePrefix.CATEGORY, ttl: 600 },
    );
  }

  // ── Get one ────────────────────────────────────────────────────────────────
  async getCategoryById(id: string, tenantId: string): Promise<ICategory> {
    const cat = await Category.findOne({ _id: id, tenantId }).populate(
      "parentId",
      "name slug",
    );
    if (!cat) throw new NotFoundError("Category");
    return cat;
  }

  async getCategoryBySlug(slug: string, tenantId: string): Promise<ICategory> {
    const cat = await Category.findOne({ slug, tenantId });
    if (!cat) throw new NotFoundError("Category");
    return cat;
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async createCategory(
    input: CreateCategoryInput,
    tenantId: string,
    userId: string,
  ): Promise<ICategory> {
    const slug = slugify(input.name, { lower: true, strict: true });
    const exists = await Category.findOne({ slug, tenantId });
    if (exists)
      throw new ConflictError(`Category "${input.name}" already exists`);

    if (input.parentId) {
      const parent = await Category.findOne({ _id: input.parentId, tenantId });
      if (!parent) throw new NotFoundError("Parent category");
    }

    const cat = await Category.create({
      ...input,
      tenantId,
      createdBy: userId,
      slug,
    });
    await deleteCache(`tree:${tenantId}`, CachePrefix.CATEGORY);
    return cat;
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  async updateCategory(
    id: string,
    input: Partial<CreateCategoryInput>,
    tenantId: string,
  ): Promise<ICategory> {
    const cat = await Category.findOne({ _id: id, tenantId });
    if (!cat) throw new NotFoundError("Category");

    if (input.name && input.name !== cat.name) {
      const newSlug = slugify(input.name, { lower: true, strict: true });
      const conflict = await Category.findOne({
        slug: newSlug,
        tenantId,
        _id: { $ne: id },
      });
      if (conflict)
        throw new ConflictError(`Category "${input.name}" already exists`);
      (input as Record<string, unknown>).slug = newSlug;
    }

    if (input.parentId === id)
      throw new BadRequestError("Category cannot be its own parent");

    const updated = await Category.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new NotFoundError("Category");

    await deleteCache(`tree:${tenantId}`, CachePrefix.CATEGORY);
    return updated;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async deleteCategory(id: string, tenantId: string): Promise<void> {
    const cat = await Category.findOne({ _id: id, tenantId });
    if (!cat) throw new NotFoundError("Category");

    if (cat.productCount > 0)
      throw new BadRequestError(
        `Cannot delete: category has ${cat.productCount} product(s). Reassign them first.`,
      );

    const children = await Category.countDocuments({ parentId: id, tenantId });
    if (children > 0)
      throw new BadRequestError(
        `Cannot delete: category has ${children} sub-categor${children > 1 ? "ies" : "y"}. Delete them first.`,
      );

    await Category.findByIdAndDelete(id);
    await deleteCache(`tree:${tenantId}`, CachePrefix.CATEGORY);
  }

  // ── Reorder ────────────────────────────────────────────────────────────────
  async reorderCategories(
    items: { id: string; sortOrder: number }[],
    tenantId: string,
  ): Promise<void> {
    await Promise.all(
      items.map(({ id, sortOrder }) =>
        Category.findOneAndUpdate({ _id: id, tenantId }, { sortOrder }),
      ),
    );
    await deleteCache(`tree:${tenantId}`, CachePrefix.CATEGORY);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  async getCategoryStats(tenantId: string) {
    const [total, active, withProducts] = await Promise.all([
      Category.countDocuments({ tenantId }),
      Category.countDocuments({ tenantId, isActive: true }),
      Category.countDocuments({ tenantId, productCount: { $gt: 0 } }),
    ]);
    return { total, active, inactive: total - active, withProducts };
  }
}

export const categoryService = new CategoryService();
