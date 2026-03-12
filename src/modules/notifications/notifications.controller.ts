import { Request, Response, NextFunction } from 'express';
import { schedulerJobs } from './scheduler';
import { emitToTenant } from '../../server';
import respond from '../../shared/utils/response';
import logger from '../../config/logger';

// ── Manual job triggers (admin only) ──────────────────────────────────────────
export async function triggerDailySummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info(`Manual daily summary triggered by ${req.user?.email}`);
    await schedulerJobs.runDailySummaries();
    respond.success(res, { message: 'Daily summary job completed', data: null });
  } catch (e) { next(e); }
}

export async function triggerLowStockAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info(`Manual low-stock alert triggered by ${req.user?.email}`);
    await schedulerJobs.runLowStockAlerts();
    respond.success(res, { message: 'Low-stock alert job completed', data: null });
  } catch (e) { next(e); }
}

export async function triggerDepreciationRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info(`Manual depreciation refresh triggered by ${req.user?.email}`);
    await schedulerJobs.runDepreciationRefresh();
    respond.success(res, { message: 'Depreciation refresh completed', data: null });
  } catch (e) { next(e); }
}

// ── Broadcast custom event to tenant ─────────────────────────────────────────
export async function broadcastEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { event, data } = req.body;
    if (!event) {
      respond.success(res, { message: 'event is required', data: null });
      return;
    }
    const tenantId = req.user?.tenantId ?? 'default';
    emitToTenant(tenantId, event, data ?? {});
    respond.success(res, { message: `Event "${event}" broadcasted to tenant`, data: { event, tenantId } });
  } catch (e) { next(e); }
}

// ── WebSocket events reference ────────────────────────────────────────────────
export function getWebSocketEvents(_req: Request, res: Response, next: NextFunction): void {
  try {
    const events = {
      server_to_client: [
        { event: 'new_sale',            description: 'New sale created',                  payload: 'orderId, orderNumber, total' },
        { event: 'new_booking',         description: 'Hotel booking confirmed',           payload: 'bookingId, bookingNumber, roomNumber' },
        { event: 'hotel_checkin',       description: 'Guest checked in',                  payload: 'bookingId, roomNumber' },
        { event: 'hotel_checkout',      description: 'Guest checked out',                 payload: 'bookingId, roomNumber, balance' },
        { event: 'low_stock_alert',     description: 'Products below min stock level',    payload: 'count, products[]' },
        { event: 'overdue_checkouts',   description: 'Guests past checkout time',         payload: 'count, bookings[]' },
        { event: 'purchase_received',   description: 'GRN created — stock updated',       payload: 'grnId, poId, itemCount' },
        { event: 'stock_adjusted',      description: 'Manual stock adjustment made',      payload: 'productId, warehouseId, delta' },
        { event: 'expense_submitted',   description: 'Expense pending approval',          payload: 'expenseId, amount, submittedBy' },
        { event: 'leave_request',       description: 'Leave request submitted',           payload: 'staffId, leaveType, days' },
      ],
      client_to_server: [
        { event: 'join_room',   description: 'Join a room for targeted events', payload: 'room (e.g. "tenant:default" or "user:userId")' },
        { event: 'leave_room',  description: 'Leave a room',                    payload: 'room' },
      ],
    };
    respond.success(res, { message: 'WebSocket event reference', data: { events } });
  } catch (e) { next(e); }
}
