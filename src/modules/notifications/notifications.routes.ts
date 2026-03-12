import { Router } from 'express';
import * as ctrl from './notifications.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin';
const admin: Role[] = ['super_admin', 'admin'];

// WebSocket event reference (any authenticated user)
router.get('/events', ctrl.getWebSocketEvents);

// Manual scheduler triggers (admin only)
router.post('/trigger/daily-summary',   authorize(...admin), ctrl.triggerDailySummary);
router.post('/trigger/low-stock',       authorize(...admin), ctrl.triggerLowStockAlerts);
router.post('/trigger/depreciation',    authorize(...admin), ctrl.triggerDepreciationRefresh);

// Broadcast arbitrary event to tenant
router.post('/broadcast',               authorize(...admin), ctrl.broadcastEvent);

export default router;
