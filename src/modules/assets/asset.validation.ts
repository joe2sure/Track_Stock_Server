import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

export const createAssetSchema = Joi.object({
  name:           Joi.string().trim().min(1).max(150).required(),
  description:    Joi.string().max(1000).optional(),
  category:       Joi.string().trim().min(1).max(100).required(),
  brand:          Joi.string().max(100).optional(),
  model:          Joi.string().max(100).optional(),
  serialNumber:   Joi.string().max(100).optional(),
  warehouseId:    joiSchemas.mongoId.optional(),
  assignedTo:     joiSchemas.mongoId.optional(),
  location:       Joi.string().max(200).optional(),
  purchaseDate:   Joi.date().iso().required(),
  purchaseCost:   Joi.number().min(0).required(),
  supplierId:     joiSchemas.mongoId.optional(),
  invoiceNumber:  Joi.string().max(100).optional(),
  depreciationMethod: Joi.string().valid('straight_line','reducing_balance','none').default('straight_line'),
  usefulLifeYears:    Joi.number().min(0).default(5),
  salvageValue:       Joi.number().min(0).default(0),
  depreciationRate:   Joi.number().min(0).max(100).default(20),
  warrantyExpiry:     Joi.date().iso().optional(),
  nextMaintenanceDate:Joi.date().iso().optional(),
  notes:          Joi.string().max(1000).optional(),
});

export const addMaintenanceSchema = Joi.object({
  date:          Joi.date().iso().required(),
  description:   Joi.string().min(3).max(500).required(),
  cost:          Joi.number().min(0).default(0),
  vendor:        Joi.string().max(150).optional(),
  nextDueDate:   Joi.date().iso().optional(),
});

export const disposeAssetSchema = Joi.object({
  disposalDate:   Joi.date().iso().required(),
  disposalValue:  Joi.number().min(0).default(0),
  disposalReason: Joi.string().min(3).max(500).required(),
});

export const assignAssetSchema = Joi.object({
  assignedTo: joiSchemas.mongoId.required(),
  location:   Joi.string().max(200).optional(),
});

export const updateAssetStatusSchema = Joi.object({
  status: Joi.string().valid('active','under_repair','stolen','written_off').required(),
  notes:  Joi.string().max(500).optional(),
});
