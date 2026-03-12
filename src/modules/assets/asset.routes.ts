import { Router } from 'express';
import * as ctrl from './asset.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  createAssetSchema, addMaintenanceSchema,
  disposeAssetSchema, assignAssetSchema, updateAssetStatusSchema,
} from './asset.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'accountant';
const mgr:  Role[] = ['super_admin','admin','manager'];
const acct: Role[] = ['super_admin','admin','manager','accountant'];

router.get('/stats',                 authorize(...acct), ctrl.getAssetStats);
router.get('/categories',            ctrl.getAssetCategories);
router.get('/',                      ctrl.getAssets);
router.get('/:id',                   ctrl.getAssetById);

router.post('/',                     authorize(...mgr),  validate(createAssetSchema),        ctrl.createAsset);
router.put('/:id',                   authorize(...mgr),  validate(createAssetSchema.fork(['name','category','purchaseDate','purchaseCost'], s => s.optional())), ctrl.updateAsset);
router.patch('/:id/assign',          authorize(...mgr),  validate(assignAssetSchema),        ctrl.assignAsset);
router.patch('/:id/unassign',        authorize(...mgr),                                      ctrl.unassignAsset);
router.patch('/:id/status',          authorize(...mgr),  validate(updateAssetStatusSchema),  ctrl.updateAssetStatus);
router.post('/:id/maintenance',      authorize(...mgr),  validate(addMaintenanceSchema),     ctrl.addMaintenance);
router.patch('/:id/dispose',         authorize(...mgr),  validate(disposeAssetSchema),       ctrl.disposeAsset);
router.post('/depreciation/refresh', authorize(...acct),                                     ctrl.refreshDepreciation);

export default router;
