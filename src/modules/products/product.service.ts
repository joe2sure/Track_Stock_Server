import { Types } from "mongoose";
import Product, { IProduct, IProductVariant } from "./product.model";
import Category from "../categories/category.model";
import Brand from "../brands/brand.model";
import Unit from "../units/unit.model";
import {
  parsePagination,
  buildPaginationMeta,
  buildSearchQuery,
  buildDateRangeQuery,
} from "../../shared/utils/pagination";
import { deleteCache, getOrSet, CachePrefix } from "../../shared/utils/cache";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";
import { emitToTenant } from "../../server";
import logger from "../../config/logger";

interface ProductQuery extends PaginationQuery {
  categoryId?: string;
  brandId?: string;
  status?: string;
  type?: string;
  isFeatured?: string;
  isPerishable?: string;
  stockStatus?: string;
  minPrice?: string;
  maxPrice?: string;
  tags?: string;
  warehouseId?: string;
  from?: string;
  to?: string;
}

interface CreateProductInput {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  shortDescription?: string;
  type?: "simple" | "variable" | "bundle" | "service";
  categoryId: string;
  brandId?: string;
  unitId: string;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  compareAtPrice?: number;
  stockQuantity?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  hasVariants?: boolean;
  variants?: Partial<IProductVariant>[];
  variationIds?: string[];
  tags?: string[];
  status?: string;
  isTrackingStock?: boolean;
  isAllowBackorder?: boolean;
  isFeatured?: boolean;
  isPerishable?: boolean;
  expiryDate?: Date;
  expiryDays?: number;
  warehouseId?: string;
  locationCode?: string;
  tax?: { isExempt?: boolean; taxRate?: number; taxType?: string };
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
    unit?: string;
  };
  metaTitle?: string;
  metaDescription?: string;
}

export class ProductService {
  // ── List products with advanced filtering ──────────────────────────────────
  async getProducts(
    query: ProductQuery,
    tenantId: string,
  ): Promise<PaginatedResult<IProduct>> {
    const { page, limit, skip, sort } = parsePagination(query);

    const filter: Record<string, unknown> = { tenantId };

    // Basic filters
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.brandId) filter.brandId = query.brandId;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.isFeatured !== undefined)
      filter.isFeatured = query.isFeatured === "true";
    if (query.isPerishable !== undefined)
      filter.isPerishable = query.isPerishable === "true";

    // Stock status filter
    if (query.stockStatus === "out_of_stock") {
      filter.stockQuantity = 0;
    } else if (query.stockStatus === "low_stock") {
      filter.$expr = {
        $and: [
          { $gt: ["$stockQuantity", 0] },
          { $lte: ["$stockQuantity", "$minStockLevel"] },
        ],
      };
    }

    // Price range
    if (query.minPrice || query.maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice);
      filter.sellingPrice = priceFilter;
    }

    // Tags
    if (query.tags) {
      filter.tags = {
        $in: query.tags.split(",").map((t) => t.trim().toLowerCase()),
      };
    }

    // Date range
    Object.assign(filter, buildDateRangeQuery(query.from, query.to));

    // Full-text search
    if (query.search) {
      Object.assign(
        filter,
        buildSearchQuery(query.search, [
          "name",
          "sku",
          "barcode",
          "description",
          "tags",
        ]),
      );
    }

    const [data, total] = await Promise.all([
      Product.find(filter)
        .populate("categoryId", "name slug")
        .populate("brandId", "name logo")
        .populate("unitId", "name abbreviation")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return {
      data: data as unknown as IProduct[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Get single product ─────────────────────────────────────────────────────
  async getProductById(id: string, tenantId: string): Promise<IProduct> {
    const product = await Product.findOne({ _id: id, tenantId })
      .populate("categoryId", "name slug parentId")
      .populate("brandId", "name logo")
      .populate("unitId", "name abbreviation type")
      .populate("variationIds", "name type options")
      .populate("warehouseId", "name code")
      .populate("createdBy", "name email");

    if (!product) throw new NotFoundError("Product");

    // Increment view count asynchronously
    void Product.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

    return product;
  }

  // ── Get by SKU ─────────────────────────────────────────────────────────────
  async getProductBySku(sku: string, tenantId: string): Promise<IProduct> {
    const product = await Product.findOne({ sku: sku.toUpperCase(), tenantId })
      .populate("categoryId", "name slug")
      .populate("brandId", "name")
      .populate("unitId", "name abbreviation");
    if (!product) throw new NotFoundError("Product");
    return product;
  }

  // ── Get by barcode ─────────────────────────────────────────────────────────
  async getProductByBarcode(
    barcode: string,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ barcode, tenantId })
      .populate("categoryId", "name")
      .populate("unitId", "name abbreviation");
    if (!product) throw new NotFoundError("Product");
    return product;
  }

  // ── Create product ─────────────────────────────────────────────────────────
  async createProduct(
    input: CreateProductInput,
    tenantId: string,
    userId: string,
  ): Promise<IProduct> {
    // SKU uniqueness
    const skuExists = await Product.findOne({
      sku: input.sku.toUpperCase(),
      tenantId,
    });
    if (skuExists) throw new ConflictError(`SKU "${input.sku}" already exists`);

    // Barcode uniqueness
    if (input.barcode) {
      const barcodeExists = await Product.findOne({
        barcode: input.barcode,
        tenantId,
      });
      if (barcodeExists)
        throw new ConflictError(`Barcode "${input.barcode}" already in use`);
    }

    // Validate references
    const [category, unit] = await Promise.all([
      Category.findOne({ _id: input.categoryId, tenantId }),
      Unit.findOne({ _id: input.unitId, tenantId }),
    ]);
    if (!category) throw new NotFoundError("Category");
    if (!unit) throw new NotFoundError("Unit");

    if (input.brandId) {
      const brand = await Brand.findOne({ _id: input.brandId, tenantId });
      if (!brand) throw new NotFoundError("Brand");
    }

    // Validate variants have unique SKUs
    if (input.hasVariants && input.variants?.length) {
      const variantSkus = input.variants.map((v) => v.sku?.toUpperCase());
      const uniqueSkus = new Set(variantSkus);
      if (uniqueSkus.size !== variantSkus.length) {
        throw new BadRequestError("Variant SKUs must be unique");
      }
    }

    const product = await Product.create({
      ...input,
      sku: input.sku.toUpperCase(),
      tenantId,
      createdBy: userId,
    });

    // Update category product count
    await Category.findByIdAndUpdate(input.categoryId, {
      $inc: { productCount: 1 },
    });
    if (input.brandId) {
      await Brand.findByIdAndUpdate(input.brandId, {
        $inc: { productCount: 1 },
      });
    }
    await Unit.findByIdAndUpdate(input.unitId, { $inc: { productCount: 1 } });

    // Invalidate caches
    await deleteCache(`stats:${tenantId}`, CachePrefix.PRODUCT);

    logger.info(
      `Product created: ${product.name} (${product.sku}) by ${userId}`,
    );

    // Check for low stock on creation
    if (
      product.isTrackingStock &&
      product.stockQuantity <= product.minStockLevel
    ) {
      emitToTenant(tenantId, "low_stock_alert", {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        current: product.stockQuantity,
        minimum: product.minStockLevel,
      });
    }

    return product;
  }

  // ── Update product ─────────────────────────────────────────────────────────
  async updateProduct(
    id: string,
    input: Partial<CreateProductInput>,
    tenantId: string,
    userId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: id, tenantId });
    if (!product) throw new NotFoundError("Product");

    // SKU uniqueness check
    if (input.sku && input.sku.toUpperCase() !== product.sku) {
      const conflict = await Product.findOne({
        sku: input.sku.toUpperCase(),
        tenantId,
        _id: { $ne: id },
      });
      if (conflict)
        throw new ConflictError(`SKU "${input.sku}" already in use`);
      input.sku = input.sku.toUpperCase();
    }

    // Handle category change — update counts
    if (
      input.categoryId &&
      input.categoryId !== product.categoryId.toString()
    ) {
      await Category.findByIdAndUpdate(product.categoryId, {
        $inc: { productCount: -1 },
      });
      await Category.findByIdAndUpdate(input.categoryId, {
        $inc: { productCount: 1 },
      });
    }

    // Handle brand change
    if (input.brandId !== undefined) {
      const oldBrandId = product.brandId?.toString();
      if (oldBrandId && oldBrandId !== input.brandId) {
        await Brand.findByIdAndUpdate(oldBrandId, {
          $inc: { productCount: -1 },
        });
      }
      if (input.brandId && input.brandId !== oldBrandId) {
        await Brand.findByIdAndUpdate(input.brandId, {
          $inc: { productCount: 1 },
        });
      }
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      { ...input, updatedBy: userId },
      { new: true, runValidators: true },
    )
      .populate("categoryId", "name slug")
      .populate("brandId", "name logo")
      .populate("unitId", "name abbreviation");

    if (!updated) throw new NotFoundError("Product");

    await deleteCache(`stats:${tenantId}`, CachePrefix.PRODUCT);
    logger.info(`Product updated: ${id} by ${userId}`);

    return updated;
  }

  // ── Delete product ─────────────────────────────────────────────────────────
  async deleteProduct(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const product = await Product.findOne({ _id: id, tenantId });
    if (!product) throw new NotFoundError("Product");

    // Soft archive instead of hard delete if product has sales history
    if (product.totalSold > 0) {
      await Product.findByIdAndUpdate(id, {
        status: "archived",
        updatedBy: userId,
      });
      logger.info(`Product archived (has sales history): ${id}`);
    } else {
      await Product.findByIdAndDelete(id);
      // Update reference counts
      await Category.findByIdAndUpdate(product.categoryId, {
        $inc: { productCount: -1 },
      });
      if (product.brandId)
        await Brand.findByIdAndUpdate(product.brandId, {
          $inc: { productCount: -1 },
        });
      await Unit.findByIdAndUpdate(product.unitId, {
        $inc: { productCount: -1 },
      });
      logger.info(`Product deleted: ${id} by ${userId}`);
    }

    await deleteCache(`stats:${tenantId}`, CachePrefix.PRODUCT);
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────
  async bulkDeleteProducts(
    ids: string[],
    tenantId: string,
    userId: string,
  ): Promise<{ deleted: number; archived: number }> {
    let deleted = 0;
    let archived = 0;

    for (const id of ids) {
      const product = await Product.findOne({ _id: id, tenantId });
      if (!product) continue;

      if (product.totalSold > 0) {
        await Product.findByIdAndUpdate(id, {
          status: "archived",
          updatedBy: userId,
        });
        archived++;
      } else {
        await Product.findByIdAndDelete(id);
        deleted++;
      }
    }

    return { deleted, archived };
  }

  // ── Duplicate product ──────────────────────────────────────────────────────
  async duplicateProduct(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<IProduct> {
    const original = await Product.findOne({ _id: id, tenantId }).lean();
    if (!original) throw new NotFoundError("Product");

    const newSku = `${original.sku}-COPY-${Date.now()}`;
    const {
      _id,
      createdAt,
      updatedAt,
      totalSold,
      totalRevenue,
      viewCount,
      slug,
      ...rest
    } = original as IProduct & {
      _id: Types.ObjectId;
      createdAt: Date;
      updatedAt: Date;
    };

    const duplicate = await Product.create({
      ...rest,
      name: `${original.name} (Copy)`,
      sku: newSku,
      barcode: undefined,
      status: "draft",
      stockQuantity: 0,
      totalSold: 0,
      totalRevenue: 0,
      viewCount: 0,
      tenantId,
      createdBy: userId,
    });

    return duplicate;
  }

  // ── Variant management ─────────────────────────────────────────────────────
  async addVariant(
    productId: string,
    variant: Partial<IProductVariant>,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");
    if (!product.hasVariants)
      throw new BadRequestError("Product is not a variable product");

    if (!variant.sku) throw new BadRequestError("Variant SKU is required");

    // Variant SKU uniqueness within product
    const skuTaken = product.variants.some(
      (v) => v.sku.toUpperCase() === variant.sku!.toUpperCase(),
    );
    if (skuTaken)
      throw new ConflictError(`Variant SKU "${variant.sku}" already exists`);

    product.variants.push({
      ...variant,
      sku: variant.sku.toUpperCase(),
    } as IProductVariant);

    await product.save();
    return product;
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: Partial<IProductVariant>,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    const idx = product.variants.findIndex(
      (v) => v._id?.toString() === variantId,
    );
    if (idx === -1) throw new NotFoundError("Variant");

    Object.assign(product.variants[idx], input);
    await product.save();
    return product;
  }

  async deleteVariant(
    productId: string,
    variantId: string,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    product.variants = product.variants.filter(
      (v) => v._id?.toString() !== variantId,
    );
    await product.save();
    return product;
  }

  // ── Image management ───────────────────────────────────────────────────────
  async addProductImage(
    productId: string,
    imageData: { url: string; publicId: string; altText?: string },
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    const isPrimary = product.images.length === 0;
    product.images.push({
      ...imageData,
      isPrimary,
      sortOrder: product.images.length,
    });
    await product.save();
    return product;
  }

  async removeProductImage(
    productId: string,
    imageIndex: number,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    if (imageIndex < 0 || imageIndex >= product.images.length) {
      throw new BadRequestError("Invalid image index");
    }

    product.images.splice(imageIndex, 1);

    // Ensure a primary image
    if (
      product.images.length > 0 &&
      !product.images.some((img) => img.isPrimary)
    ) {
      product.images[0].isPrimary = true;
    }

    await product.save();
    return product;
  }

  async setPrimaryImage(
    productId: string,
    imageIndex: number,
    tenantId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    product.images.forEach((img, i) => {
      img.isPrimary = i === imageIndex;
    });
    await product.save();
    return product;
  }

  // ── Bulk operations ────────────────────────────────────────────────────────
  async bulkUpdateStatus(
    ids: string[],
    status: string,
    tenantId: string,
    userId: string,
  ): Promise<number> {
    const result = await Product.updateMany(
      { _id: { $in: ids }, tenantId },
      { status, updatedBy: userId },
    );
    return result.modifiedCount;
  }

  async bulkUpdatePrice(
    ids: string[],
    priceData: {
      sellingPrice?: number;
      costPrice?: number;
      discountPercent?: number;
    },
    tenantId: string,
    userId: string,
  ): Promise<number> {
    const result = await Product.updateMany(
      { _id: { $in: ids }, tenantId },
      { ...priceData, updatedBy: userId },
    );
    return result.modifiedCount;
  }

  // ── Low stock products ─────────────────────────────────────────────────────
  async getLowStockProducts(tenantId: string, limit = 50): Promise<IProduct[]> {
    return Product.find({
      tenantId,
      isTrackingStock: true,
      status: "active",
      $expr: { $lte: ["$stockQuantity", "$minStockLevel"] },
    })
      .select("name sku barcode stockQuantity minStockLevel status categoryId")
      .populate("categoryId", "name")
      .sort({ stockQuantity: 1 })
      .limit(limit)
      .lean() as Promise<IProduct[]>;
  }

  // ── Expiring soon ──────────────────────────────────────────────────────────
  async getExpiringProducts(
    tenantId: string,
    daysAhead = 30,
  ): Promise<IProduct[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    return Product.find({
      tenantId,
      isPerishable: true,
      status: "active",
      expiryDate: { $lte: cutoff, $gte: new Date() },
    })
      .sort({ expiryDate: 1 })
      .lean() as Promise<IProduct[]>;
  }

  // ── Import products from CSV/JSON ─────────────────────────────────────────
  async importProducts(
    rows: Partial<CreateProductInput>[],
    tenantId: string,
    userId: string,
  ): Promise<{
    created: number;
    updated: number;
    errors: Array<{ row: number; error: string }>;
  }> {
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.sku) {
          errors.push({ row: i + 1, error: "SKU is required" });
          continue;
        }

        const existing = await Product.findOne({
          sku: row.sku.toUpperCase(),
          tenantId,
        });
        if (existing) {
          await this.updateProduct(
            existing._id.toString(),
            row,
            tenantId,
            userId,
          );
          updated++;
        } else {
          if (
            !row.categoryId ||
            !row.unitId ||
            !row.name ||
            row.costPrice === undefined ||
            row.sellingPrice === undefined
          ) {
            errors.push({
              row: i + 1,
              error:
                "Missing required fields: name, categoryId, unitId, costPrice, sellingPrice",
            });
            continue;
          }
          await this.createProduct(row as CreateProductInput, tenantId, userId);
          created++;
        }
      } catch (err) {
        errors.push({ row: i + 1, error: (err as Error).message });
      }
    }

    logger.info(
      `Product import: ${created} created, ${updated} updated, ${errors.length} errors`,
    );
    return { created, updated, errors };
  }

  // ── Product statistics ─────────────────────────────────────────────────────
  async getProductStats(tenantId: string) {
    return getOrSet(
      `stats:${tenantId}`,
      async () => {
        const [
          total,
          active,
          draft,
          inactive,
          archived,
          outOfStock,
          lowStock,
          withVariants,
          byCategory,
          byStatus,
          topRevenue,
        ] = await Promise.all([
          Product.countDocuments({ tenantId }),
          Product.countDocuments({ tenantId, status: "active" }),
          Product.countDocuments({ tenantId, status: "draft" }),
          Product.countDocuments({ tenantId, status: "inactive" }),
          Product.countDocuments({ tenantId, status: "archived" }),
          Product.countDocuments({
            tenantId,
            stockQuantity: 0,
            isTrackingStock: true,
          }),
          Product.countDocuments({
            tenantId,
            isTrackingStock: true,
            stockQuantity: { $gt: 0 },
            $expr: { $lte: ["$stockQuantity", "$minStockLevel"] },
          }),
          Product.countDocuments({ tenantId, hasVariants: true }),
          Product.aggregate([
            { $match: { tenantId } },
            { $group: { _id: "$categoryId", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]),
          Product.aggregate([
            { $match: { tenantId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          Product.find({ tenantId, status: "active" })
            .sort({ totalRevenue: -1 })
            .limit(5)
            .select("name sku totalRevenue totalSold")
            .lean(),
        ]);

        const totalStockValue = await Product.aggregate([
          { $match: { tenantId, status: { $ne: "archived" } } },
          {
            $group: {
              _id: null,
              value: { $sum: { $multiply: ["$stockQuantity", "$costPrice"] } },
            },
          },
        ]);

        return {
          total,
          active,
          draft,
          inactive,
          archived,
          outOfStock,
          lowStock,
          withVariants,
          byCategory,
          byStatus,
          topRevenue,
          totalStockValue: totalStockValue[0]?.value ?? 0,
        };
      },
      { prefix: CachePrefix.PRODUCT, ttl: 300 },
    );
  }

  // ── Search products (for POS quick lookup) ─────────────────────────────────
  async searchProducts(
    query: string,
    tenantId: string,
    limit = 10,
  ): Promise<IProduct[]> {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return Product.find({
      tenantId,
      status: "active",
      $or: [
        { name: { $regex: escaped, $options: "i" } },
        { sku: { $regex: escaped, $options: "i" } },
        { barcode: { $regex: escaped, $options: "i" } },
        { tags: { $regex: escaped, $options: "i" } },
      ],
    })
      .select(
        "name sku barcode sellingPrice costPrice stockQuantity images unitId tax hasVariants variants status",
      )
      .populate("unitId", "name abbreviation")
      .limit(limit)
      .lean() as Promise<IProduct[]>;
  }

  // ── Adjust stock directly (for admin corrections) ──────────────────────────
  async adjustStock(
    productId: string,
    adjustment: number,
    reason: string,
    tenantId: string,
    userId: string,
  ): Promise<IProduct> {
    const product = await Product.findOne({ _id: productId, tenantId });
    if (!product) throw new NotFoundError("Product");

    const newQty = product.stockQuantity + adjustment;
    if (newQty < 0)
      throw new BadRequestError(
        `Adjustment would result in negative stock (current: ${product.stockQuantity})`,
      );

    const updated = await Product.findByIdAndUpdate(
      productId,
      { stockQuantity: newQty, updatedBy: userId },
      { new: true },
    );
    if (!updated) throw new NotFoundError("Product");

    // Emit low stock alert if applicable
    if (
      updated.isTrackingStock &&
      updated.stockQuantity <= updated.minStockLevel
    ) {
      emitToTenant(tenantId, "low_stock_alert", {
        productId: updated._id,
        name: updated.name,
        sku: updated.sku,
        current: updated.stockQuantity,
        minimum: updated.minStockLevel,
      });
    }

    logger.info(
      `Stock adjusted: ${productId} by ${adjustment} (reason: ${reason}) by ${userId}`,
    );
    return updated;
  }
}

export const productService = new ProductService();
