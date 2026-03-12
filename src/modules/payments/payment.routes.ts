import { Router } from 'express';
import * as ctrl from './payment.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';

const router = Router();

// Webhook — public, no auth (Paystack calls this)
router.post('/paystack/webhook', ctrl.paystackWebhook);

// All other routes require auth
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'accountant';
const viewer: Role[] = ['super_admin','admin','manager','accountant'];

router.post('/initialize',             ctrl.initializePayment);
router.get('/verify/:reference',       ctrl.verifyPayment);
router.get('/:reference',              ctrl.getPayment);
router.get('/',                        authorize(...viewer), ctrl.listPayments);

export default router;
