import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

const poItemSchema = Joi.object({
  productId:       joiSchemas.mongoId.required(),
  variantId:       joiSchemas.mongoId.optional(),
  orderedQuantity: Joi.number().positive().required(),
  unitCost:        Joi.number().min(0).required(),
  discountPercent: Joi.number().min(0).max(100).default(0),
  taxRate:         Joi.number().min(0).max(100).default(0),
  notes:           Joi.string().max(300).optional(),
});

export const createPOSchema = Joi.object({
  supplierId:        joiSchemas.mongoId.required(),
  warehouseId:       joiSchemas.mongoId.required(),
  items:             Joi.array().items(poItemSchema).min(1).required(),
  shippingCost:      Joi.number().min(0).default(0),
  otherCharges:      Joi.number().min(0).default(0),
  notes:             Joi.string().max(1000).optional(),
  internalNotes:     Joi.string().max(1000).optional(),
  orderDate:         Joi.date().iso().optional(),
  expectedDate:      Joi.date().iso().optional(),
  supplierReference: Joi.string().max(100).optional(),
  currency:          joiSchemas.currency,
});

export const updatePOSchema = Joi.object({
  items:             Joi.array().items(poItemSchema).min(1).optional(),
  shippingCost:      Joi.number().min(0).optional(),
  otherCharges:      Joi.number().min(0).optional(),
  notes:             Joi.string().max(1000).optional(),
  internalNotes:     Joi.string().max(1000).optional(),
  expectedDate:      Joi.date().iso().optional(),
  supplierReference: Joi.string().max(100).optional(),
});

const paymentSchema = Joi.object({
  method:    Joi.string().valid('cash','transfer','cheque','credit','advance').required(),
  amount:    Joi.number().positive().required(),
  reference: Joi.string().max(200).optional(),
  paidAt:    Joi.date().iso().optional(),
  notes:     Joi.string().max(200).optional(),
});

export const addPaymentSchema = Joi.object({
  payment: paymentSchema.required(),
});

const grnItemSchema = Joi.object({
  poItemId:         joiSchemas.mongoId.required(),
  productId:        joiSchemas.mongoId.required(),
  variantId:        joiSchemas.mongoId.optional(),
  receivedQuantity: Joi.number().min(0).required(),
  rejectedQuantity: Joi.number().min(0).default(0),
  unitCost:         Joi.number().min(0).optional(),
  batchNumber:      Joi.string().max(100).optional(),
  expiryDate:       Joi.date().iso().optional(),
  locationCode:     Joi.string().max(50).optional(),
  notes:            Joi.string().max(300).optional(),
});

export const createGRNSchema = Joi.object({
  purchaseOrderId: joiSchemas.mongoId.required(),
  items:           Joi.array().items(grnItemSchema).min(1).required(),
  deliveryNote:    Joi.string().max(100).optional(),
  vehicleNumber:   Joi.string().max(50).optional(),
  driverName:      Joi.string().max(100).optional(),
  notes:           Joi.string().max(1000).optional(),
  internalNotes:   Joi.string().max(1000).optional(),
  receivedAt:      Joi.date().iso().optional(),
});

const returnItemSchema = Joi.object({
  productId:      joiSchemas.mongoId.required(),
  variantId:      joiSchemas.mongoId.optional(),
  returnQuantity: Joi.number().positive().required(),
  unitCost:       Joi.number().min(0).required(),
  reason:         Joi.string().valid('damaged','wrong_item','expired','excess','quality_issue','other').required(),
  notes:          Joi.string().max(300).optional(),
});

export const createReturnSchema = Joi.object({
  supplierId:       joiSchemas.mongoId.required(),
  purchaseOrderId:  joiSchemas.mongoId.optional(),
  grnId:            joiSchemas.mongoId.optional(),
  warehouseId:      joiSchemas.mongoId.required(),
  items:            Joi.array().items(returnItemSchema).min(1).required(),
  refundMethod:     Joi.string().valid('credit_note','bank_transfer','deduction').optional(),
  notes:            Joi.string().max(1000).optional(),
});

export const creditNoteSchema = Joi.object({
  creditNoteNumber: Joi.string().required(),
  refundAmount:     Joi.number().min(0).required(),
  refundMethod:     Joi.string().valid('credit_note','bank_transfer','deduction').required(),
});
