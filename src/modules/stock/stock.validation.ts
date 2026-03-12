import Joi from "joi";
import { joiSchemas } from "../../shared/middleware/validate.middleware";

export const adjustStockSchema = Joi.object({
  productId: joiSchemas.mongoId.required(),
  variantId: joiSchemas.mongoId.optional(),
  warehouseId: joiSchemas.mongoId.required(),
  quantity: Joi.number().positive().required(),
  type: Joi.string()
    .valid(
      "adjustment_add",
      "adjustment_remove",
      "damage",
      "expiry",
      "initial_stock",
      "recount",
      "purchase_receipt",
      "sale_return",
    )
    .required(),
  costPrice: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).optional(),
  batchNumber: Joi.string().max(100).optional(),
  expiryDate: Joi.date().iso().optional(),
  referenceNumber: Joi.string().max(100).optional(),
});

export const createTransferSchema = Joi.object({
  fromWarehouseId: joiSchemas.mongoId.required(),
  toWarehouseId: joiSchemas.mongoId.required(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: joiSchemas.mongoId.required(),
        variantId: joiSchemas.mongoId.optional(),
        quantity: Joi.number().integer().min(1).required(),
        notes: Joi.string().max(200).optional(),
      }),
    )
    .min(1)
    .required(),
  notes: Joi.string().max(1000).optional(),
  expectedDate: Joi.date().iso().optional(),
});

export const receiveTransferSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        itemId: Joi.string().required(),
        receivedQuantity: Joi.number().integer().min(0).required(),
        notes: Joi.string().max(200).optional(),
      }),
    )
    .min(1)
    .required(),
});

export const reconcileSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: joiSchemas.mongoId.required(),
        warehouseId: joiSchemas.mongoId.required(),
        actualQuantity: Joi.number().integer().min(0).required(),
        notes: Joi.string().max(200).optional(),
      }),
    )
    .min(1)
    .required(),
});

export const rejectTransferSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});

export const cancelTransferSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});
