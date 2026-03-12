import Joi from "joi";
import { joiSchemas } from "../../shared/middleware/validate.middleware";

const paymentSchema = Joi.object({
  method: Joi.string()
    .valid(
      "cash",
      "card",
      "transfer",
      "pos_terminal",
      "wallet",
      "credit",
      "split",
    )
    .required(),
  amount: Joi.number().positive().required(),
  reference: Joi.string().max(200).optional(),
  provider: Joi.string().max(100).optional(),
  notes: Joi.string().max(200).optional(),
});

const itemSchema = Joi.object({
  productId: joiSchemas.mongoId.required(),
  variantId: joiSchemas.mongoId.optional(),
  quantity: Joi.number().positive().required(),
  unitPrice: Joi.number().min(0).required(),
  costPrice: Joi.number().min(0).default(0),
  discountPercent: Joi.number().min(0).max(100).default(0),
  discountAmount: Joi.number().min(0).default(0),
  taxRate: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().max(300).optional(),
});

export const createSaleSchema = Joi.object({
  type: Joi.string()
    .valid("pos", "invoice", "quotation", "credit_sale")
    .default("pos"),
  customerId: joiSchemas.mongoId.optional(),
  customerName: Joi.string().max(150).optional(),
  customerPhone: joiSchemas.phone.optional(),
  customerEmail: joiSchemas.email.optional(),
  warehouseId: joiSchemas.mongoId.required(),
  items: Joi.array().items(itemSchema).min(1).required(),
  discountType: Joi.string().valid("none", "percent", "fixed").default("none"),
  discountValue: Joi.number().min(0).default(0),
  shippingAmount: Joi.number().min(0).default(0),
  payments: Joi.array().items(paymentSchema).min(0).default([]),
  notes: Joi.string().max(1000).optional(),
  internalNotes: Joi.string().max(1000).optional(),
  saleDate: Joi.date().iso().optional(),
  dueDate: Joi.date().iso().optional(),
  purchaseOrderNumber: Joi.string().max(100).optional(),
  currency: joiSchemas.currency,
  cashRegisterId: Joi.string().optional(),
  shiftId: Joi.string().optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).default([]),
});

export const updateSaleSchema = Joi.object({
  status: Joi.string()
    .valid("draft", "pending", "confirmed", "cancelled")
    .optional(),
  customerName: Joi.string().max(150).optional(),
  customerPhone: joiSchemas.phone.optional(),
  notes: Joi.string().max(1000).optional(),
  internalNotes: Joi.string().max(1000).optional(),
  dueDate: Joi.date().iso().optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
});

export const addPaymentSchema = Joi.object({
  payment: paymentSchema.required(),
});

export const createReturnSchema = Joi.object({
  reason: Joi.string().min(3).max(500).required(),
  items: Joi.array()
    .items(
      Joi.object({
        saleItemId: Joi.string().required(),
        returnQuantity: Joi.number().positive().required(),
        restockToWarehouse: Joi.boolean().default(true),
      }),
    )
    .min(1)
    .required(),
  refundMethod: Joi.string()
    .valid("cash", "card", "transfer", "wallet", "store_credit")
    .required(),
  refundNotes: Joi.string().max(500).optional(),
});

export const createCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  phone: joiSchemas.phone.optional(),
  email: joiSchemas.email.optional(),
  address: Joi.string().max(300).optional(),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  country: Joi.string().default("Nigeria"),
  type: Joi.string().valid("retail", "wholesale", "credit").default("retail"),
  creditLimit: Joi.number().min(0).default(0),
  discountPercent: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().max(500).optional(),
});

export const dailyClosingSchema = Joi.object({
  warehouseId: joiSchemas.mongoId.required(),
  cashRegisterId: Joi.string().optional(),
  expectedCash: Joi.number().min(0).required(),
  actualCash: Joi.number().min(0).required(),
  notes: Joi.string().max(500).optional(),
});
