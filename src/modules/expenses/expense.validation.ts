import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

export const createExpenseSchema = Joi.object({
  title:       Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().max(1000).optional(),
  category:    Joi.string().trim().min(1).max(100).required(),
  amount:      Joi.number().min(0).required(),
  taxAmount:   Joi.number().min(0).default(0),
  expenseDate: Joi.date().iso().required(),
  warehouseId: joiSchemas.mongoId.optional(),
  staffId:     joiSchemas.mongoId.optional(),
  isBillable:  Joi.boolean().default(false),
  notes:       Joi.string().max(1000).optional(),
  tags:        Joi.array().items(Joi.string().max(50)).max(10).default([]),
});

export const reviewExpenseSchema = Joi.object({
  action:           Joi.string().valid('approve','reject').required(),
  reviewNotes:      Joi.string().max(500).optional(),
});

export const payExpenseSchema = Joi.object({
  paymentMethod:    Joi.string().valid('cash','bank_transfer','card','petty_cash').required(),
  paidAt:           Joi.date().iso().optional(),
  paymentReference: Joi.string().max(200).optional(),
});
