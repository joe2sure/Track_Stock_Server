import { Request, Response, NextFunction } from "express";
import { productService } from "./product.service";
import respond from "../../shared/utils/response";

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products with filtering and pagination
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - $ref: '#/components/parameters/SortByParam'
 *       - $ref: '#/components/parameters/SortOrderParam'
 *       - { name: categoryId,   in: query, schema: { type: string } }
 *       - { name: brandId,      in: query, schema: { type: string } }
 *       - { name: status,       in: query, schema: { type: string, enum: [active,inactive,draft,archived] } }
 *       - { name: type,         in: query, schema: { type: string, enum: [simple,variable,bundle,service] } }
 *       - { name: stockStatus,  in: query, schema: { type: string, enum: [in_stock,low_stock,out_of_stock] } }
 *       - { name: minPrice,     in: query, schema: { type: number } }
 *       - { name: maxPrice,     in: query, schema: { type: number } }
 *       - { name: isFeatured,   in: query, schema: { type: boolean } }
 *       - { name: tags,         in: query, schema: { type: string }, description: "Comma-separated list" }
 *       - { name: from,         in: query, schema: { type: string, format: date } }
 *       - { name: to,           in: query, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Paginated product list
 */
export async function getProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await productService.getProducts(
      req.query as Record<string, string>,
      req.user?.tenantId ?? "default",
    );
    respond.paginated(
      res,
      result.data,
      result.pagination,
      "Products retrieved",
    );
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/search:
 *   get:
 *     tags: [Products]
 *     summary: Quick search for POS terminal (by name, SKU, barcode)
 *     parameters:
 *       - { name: q,     in: query, required: true, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Matching products
 */
export async function searchProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = String(req.query.q ?? "");
    const limit = parseInt(String(req.query.limit ?? "10"), 10);
    const products = await productService.searchProducts(
      q,
      req.user?.tenantId ?? "default",
      limit,
    );
    respond.success(res, { message: "Search results", data: { products } });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/stats:
 *   get:
 *     tags: [Products]
 *     summary: Product statistics and KPIs
 *     responses:
 *       200:
 *         description: Stats object
 */
export async function getProductStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await productService.getProductStats(
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Product stats retrieved",
      data: { stats },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/low-stock:
 *   get:
 *     tags: [Products]
 *     summary: Products at or below minimum stock level
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 */
export async function getLowStockProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const limit = parseInt(String(req.query.limit ?? "50"), 10);
    const products = await productService.getLowStockProducts(
      req.user?.tenantId ?? "default",
      limit,
    );
    respond.success(res, {
      message: "Low stock products",
      data: { products, count: products.length },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/expiring:
 *   get:
 *     tags: [Products]
 *     summary: Perishable products expiring within N days
 *     parameters:
 *       - { name: days, in: query, schema: { type: integer, default: 30 } }
 */
export async function getExpiringProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const days = parseInt(String(req.query.days ?? "30"), 10);
    const products = await productService.getExpiringProducts(
      req.user?.tenantId ?? "default",
      days,
    );
    respond.success(res, {
      message: "Expiring products",
      data: { products, count: products.length },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/barcode/{barcode}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by barcode (POS scanner)
 *     parameters:
 *       - { name: barcode, in: path, required: true, schema: { type: string } }
 */
export async function getProductByBarcode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.getProductByBarcode(
      req.params.barcode,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Product found", data: { product } });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/sku/{sku}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by SKU
 */
export async function getProductBySku(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.getProductBySku(
      req.params.sku,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Product found", data: { product } });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 */
export async function getProductById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.getProductById(
      req.params.id,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Product retrieved", data: { product } });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 */
export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.createProduct(
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, {
      message: "Product created successfully",
      data: { product },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product
 */
export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.updateProduct(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: "Product updated successfully",
      data: { product },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete or archive a product
 */
export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await productService.deleteProduct(
      req.params.id,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.noContent(res);
  } catch (e) {
    next(e);
  }
}

/**
 * @swagger
 * /products/{id}/duplicate:
 *   post:
 *     tags: [Products]
 *     summary: Duplicate a product
 */
export async function duplicateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.duplicateProduct(
      req.params.id,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.created(res, { message: "Product duplicated", data: { product } });
  } catch (e) {
    next(e);
  }
}

// ── Variant controllers ──────────────────────────────────────────────────────
export async function addVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.addVariant(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Variant added", data: { product } });
  } catch (e) {
    next(e);
  }
}

export async function updateVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.updateVariant(
      req.params.id,
      req.params.variantId,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Variant updated", data: { product } });
  } catch (e) {
    next(e);
  }
}

export async function deleteVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.deleteVariant(
      req.params.id,
      req.params.variantId,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Variant deleted", data: { product } });
  } catch (e) {
    next(e);
  }
}

// ── Image controllers ────────────────────────────────────────────────────────
export async function addProductImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.addProductImage(
      req.params.id,
      req.body,
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Image added", data: { product } });
  } catch (e) {
    next(e);
  }
}

export async function removeProductImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.removeProductImage(
      req.params.id,
      parseInt(req.params.index, 10),
      req.user?.tenantId ?? "default",
    );
    respond.success(res, { message: "Image removed", data: { product } });
  } catch (e) {
    next(e);
  }
}

export async function setPrimaryImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.setPrimaryImage(
      req.params.id,
      parseInt(req.body.index, 10),
      req.user?.tenantId ?? "default",
    );
    respond.success(res, {
      message: "Primary image updated",
      data: { product },
    });
  } catch (e) {
    next(e);
  }
}

// ── Bulk controllers ─────────────────────────────────────────────────────────
export async function bulkUpdateStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await productService.bulkUpdateStatus(
      req.body.ids,
      req.body.status,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: `${count} product(s) updated`,
      data: { updatedCount: count },
    });
  } catch (e) {
    next(e);
  }
}

export async function bulkDeleteProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await productService.bulkDeleteProducts(
      req.body.ids,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Bulk delete complete", data: result });
  } catch (e) {
    next(e);
  }
}

export async function bulkUpdatePrice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const count = await productService.bulkUpdatePrice(
      req.body.ids,
      req.body,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: `${count} product(s) price updated`,
      data: { updatedCount: count },
    });
  } catch (e) {
    next(e);
  }
}

export async function adjustStock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.adjustStock(
      req.params.id,
      req.body.adjustment,
      req.body.reason,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Stock adjusted", data: { product } });
  } catch (e) {
    next(e);
  }
}

export async function importProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await productService.importProducts(
      req.body.products,
      req.user?.tenantId ?? "default",
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "Import complete", data: result });
  } catch (e) {
    next(e);
  }
}
