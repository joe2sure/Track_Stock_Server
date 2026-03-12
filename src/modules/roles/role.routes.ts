import { Router } from 'express';
import * as ctrl from './role.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { createRoleSchema, updateRoleSchema, cloneRoleSchema } from './role.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin';
const admin: Role[] = ['super_admin', 'admin'];

router.get('/permissions',          ctrl.getPermissionRegistry);
router.get('/',                     ctrl.getRoles);
router.get('/:id',                  ctrl.getRoleById);
router.post('/seed',                authorize(...admin), ctrl.seedSystemRoles);
router.post('/',                    authorize(...admin), validate(createRoleSchema),  ctrl.createRole);
router.put('/:id',                  authorize(...admin), validate(updateRoleSchema),  ctrl.updateRole);
router.post('/:id/clone',           authorize(...admin), validate(cloneRoleSchema),   ctrl.cloneRole);
router.delete('/:id',               authorize(...admin), ctrl.deleteRole);

export default router;
