import Joi from "joi";
import { joiSchemas } from "../../shared/middleware/validate.middleware";

const variantSchema = Joi.object({
  sku: Joi.string().trim().min(1).max(100).required(),
  name: Joi.string().trim().min(1).max(200).required(),
  attributes: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  costPrice: joiSchemas.positiveNumber.required(),
  sellingPrice: joiSchemas.positiveNumber.required(),
  wholesalePrice: joiSchemas.positiveNumber.optional(),
  compareAtPrice: joiSchemas.positiveNumber.optional(),
  stockQuantity: joiSchemas.nonNegativeInt.default(0),
  minStockLevel: joiSchemas.nonNegativeInt.default(0),
  maxStockLevel: joiSchemas.nonNegativeInt.optional(),
  barcode: Joi.string().optional(),
  weight: Joi.number().min(0).optional(),
  isActive: Joi.boolean().default(true),
  images: Joi.array().items(Joi.string().uri()).default([]),
});

const taxSchema = Joi.object({
  isExempt: Joi.boolean().default(false),
  taxRate: Joi.number().min(0).max(100).optional(),
  taxType: Joi.string().optional(),
});

const dimensionsSchema = Joi.object({
  length: Joi.number().min(0).optional(),
  width: Joi.number().min(0).optional(),
  height: Joi.number().min(0).optional(),
  weight: Joi.number().min(0).optional(),
  unit: Joi.string().default("cm"),
});

export const createProductSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  sku: Joi.string().trim().min(1).max(100).required(),
  barcode: Joi.string().trim().optional(),
  description: Joi.string().max(5000).optional(),
  shortDescription: Joi.string().max(500).optional(),
  type: Joi.string()
    .valid("simple", "variable", "bundle", "service")
    .default("simple"),
  categoryId: joiSchemas.mongoId.required(),
  brandId: joiSchemas.mongoId.optional(),
  unitId: joiSchemas.mongoId.required(),
  costPrice: joiSchemas.positiveNumber.required(),
  sellingPrice: joiSchemas.positiveNumber.required(),
  wholesalePrice: joiSchemas.positiveNumber.optional(),
  compareAtPrice: joiSchemas.positiveNumber.optional(),
  discountPercent: Joi.number().min(0).max(100).optional(),
  stockQuantity: joiSchemas.nonNegativeInt.default(0),
  minStockLevel: joiSchemas.nonNegativeInt.default(0),
  maxStockLevel: joiSchemas.nonNegativeInt.optional(),
  reorderPoint: joiSchemas.nonNegativeInt.optional(),
  reorderQuantity: joiSchemas.nonNegativeInt.optional(),
  hasVariants: Joi.boolean().default(false),
  variants: Joi.array().items(variantSchema).default([]),
  variationIds: Joi.array().items(joiSchemas.mongoId).default([]),
  tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
  status: Joi.string()
    .valid("active", "inactive", "draft", "archived")
    .default("active"),
  isTrackingStock: Joi.boolean().default(true),
  isAllowBackorder: Joi.boolean().default(false),
  isFeatured: Joi.boolean().default(false),
  isPerishable: Joi.boolean().default(false),
  expiryDate: Joi.date().iso().optional(),
  expiryDays: Joi.number().integer().min(1).optional(),
  warehouseId: joiSchemas.mongoId.optional(),
  locationCode: Joi.string().max(50).optional(),
  tax: taxSchema.optional(),
  dimensions: dimensionsSchema.optional(),
  metaTitle: Joi.string().max(70).optional(),
  metaDescription: Joi.string().max(160).optional(),
});

export const updateProductSchema = createProductSchema.fork(
  ["name", "sku", "categoryId", "unitId", "costPrice", "sellingPrice"],
  (s) => s.optional(),
);

export const bulkStatusSchema = Joi.object({
  ids: Joi.array().items(joiSchemas.mongoId).min(1).required(),
  status: Joi.string()
    .valid("active", "inactive", "draft", "archived")
    .required(),
});

export const bulkPriceSchema = Joi.object({
  ids: Joi.array().items(joiSchemas.mongoId).min(1).required(),
  sellingPrice: joiSchemas.positiveNumber.optional(),
  costPrice: joiSchemas.positiveNumber.optional(),
  discountPercent: Joi.number().min(0).max(100).optional(),
});

export const adjustStockSchema = Joi.object({
  adjustment: Joi.number()
    .integer()
    .not(0)
    .required()
    .messages({ "any.invalid": "Adjustment cannot be zero" }),
  reason: Joi.string().min(3).max(200).required(),
});

export const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(joiSchemas.mongoId).min(1).required(),
});
