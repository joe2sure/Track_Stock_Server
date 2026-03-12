import { Router } from 'express';
import * as ctrl from './settings.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { invoiceResetSchema, bootstrapSchema } from './settings.validation';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager';
const admin: Role[] = ['super_admin','admin'];
const mgr:   Role[] = ['super_admin','admin','manager'];

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/',                          ctrl.getSettings);
router.put('/:section',                  authorize(...mgr),   ctrl.updateSettings);
router.put('/',                          authorize(...mgr),   ctrl.updateSettings);     // section = 'all'

// ── Bootstrap (first-time tenant setup) ──────────────────────────────────────
router.post('/bootstrap',               authorize(...admin), validate(bootstrapSchema), ctrl.bootstrapTenant);

// ── Invoice counter ───────────────────────────────────────────────────────────
router.get('/invoice/next-number',       ctrl.getNextInvoiceNumber);
router.post('/invoice/reset-counter',    authorize(...admin), validate(invoiceResetSchema), ctrl.resetInvoiceCounter);

export default router;
