import { Router } from 'express';
import * as ctrl from './brand.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import Joi from 'joi';

const router = Router();
router.use(authenticate);

const schema = Joi.object({
  name:        Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  logo:        Joi.string().uri().optional(),
  website:     Joi.string().uri().optional(),
  country:     Joi.string().max(100).optional(),
  isActive:    Joi.boolean().default(true),
});

router.get('/stats', ctrl.getBrandStats);
router.get('/',      ctrl.getBrands);
router.get('/:id',   ctrl.getBrandById);

router.post('/',     authorize('super_admin','admin','manager'), validate(schema), ctrl.createBrand);
router.put('/:id',   authorize('super_admin','admin','manager'), validate(schema.fork(['name'], s => s.optional())), ctrl.updateBrand);
router.delete('/:id',authorize('super_admin','admin','manager'), ctrl.deleteBrand);

export default router;
