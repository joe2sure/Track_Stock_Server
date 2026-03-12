import { Router } from 'express';
import * as ctrl from './supplier.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { joiSchemas } from '../../shared/middleware/validate.middleware';
import Joi from 'joi';

const router = Router();
router.use(authenticate);

const schema = Joi.object({
  name:               Joi.string().trim().min(1).max(150).required(),
  contactPerson:      Joi.string().max(100).optional(),
  phone:              joiSchemas.phone.optional(),
  email:              joiSchemas.email.optional(),
  website:            Joi.string().uri().optional(),
  address:            Joi.string().max(300).optional(),
  city:               Joi.string().optional(),
  state:              Joi.string().optional(),
  country:            Joi.string().default('Nigeria'),
  taxId:              Joi.string().max(50).optional(),
  bankName:           Joi.string().max(100).optional(),
  bankAccountNumber:  Joi.string().max(50).optional(),
  bankAccountName:    Joi.string().max(150).optional(),
  paymentTerms:       Joi.number().integer().min(0).default(30),
  creditLimit:        Joi.number().min(0).default(0),
  discountPercent:    Joi.number().min(0).max(100).default(0),
  leadTimeDays:       Joi.number().integer().min(0).default(1),
  rating:             Joi.number().min(0).max(5).default(0),
  notes:              Joi.string().max(1000).optional(),
});

router.get('/stats', ctrl.getSupplierStats);
router.get('/',      ctrl.getSuppliers);
router.get('/:id',   ctrl.getSupplierById);

router.post('/',      authorize('super_admin','admin','manager'), validate(schema),                                              ctrl.createSupplier);
router.put('/:id',    authorize('super_admin','admin','manager'), validate(schema.fork(['name'], s => s.optional())),           ctrl.updateSupplier);
router.delete('/:id', authorize('super_admin','admin'),                                                                         ctrl.deleteSupplier);

export default router;
