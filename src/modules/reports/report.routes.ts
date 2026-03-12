import { Router } from 'express';
import * as ctrl from './report.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'accountant';
const viewer: Role[] = ['super_admin', 'admin', 'manager', 'accountant'];

router.get('/overview',        ctrl.getDashboardOverview);
router.get('/sales',           authorize(...viewer), ctrl.getSalesReport);
router.get('/profit-loss',     authorize(...viewer), ctrl.getProfitLoss);
router.get('/stock-valuation', authorize(...viewer), ctrl.getStockValuation);
router.get('/purchases',       authorize(...viewer), ctrl.getPurchasesReport);
router.get('/hotel',           authorize(...viewer), ctrl.getHotelReport);
router.get('/expenses',        authorize(...viewer), ctrl.getExpenseReport);
router.get('/low-stock',       ctrl.getLowStockReport);

export default router;
