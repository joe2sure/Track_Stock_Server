import { Request, Response, NextFunction } from 'express';
import { stockService } from './stock.service';
import respond from '../../shared/utils/response';

export async function getStockSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await stockService.getStockSummary(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Stock summary', data });
  } catch (e) { next(e); }
}

export async function getStockLevels(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await stockService.getStockLevels(req.query as Record<string,string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Stock levels retrieved');
  } catch (e) { next(e); }
}

export async function getProductStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const levels = await stockService.getProductStock(req.params.productId, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Product stock', data: { levels } });
  } catch (e) { next(e); }
}

export async function getInventoryValuation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await stockService.getInventoryValuation(req.query as Record<string,string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Inventory valuation', data });
  } catch (e) { next(e); }
}

export async function getLowStockReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await stockService.getLowStockReport(req.user?.tenantId ?? 'default', req.query.warehouseId as string | undefined);
    respond.success(res, { message: 'Low stock report', data: { items, count: items.length } });
  } catch (e) { next(e); }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stockService.adjustStock(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Stock adjusted', data: result });
  } catch (e) { next(e); }
}

export async function reconcileStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stockService.reconcileStock(req.body.items, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Reconciliation complete', data: result });
  } catch (e) { next(e); }
}

export async function getMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await stockService.getMovements(req.query as Record<string,string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Movement history');
  } catch (e) { next(e); }
}

export async function getTransfers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await stockService.getTransfers(req.query as Record<string,string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Transfers retrieved');
  } catch (e) { next(e); }
}

export async function getTransferById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.getTransferById(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Transfer retrieved', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function createTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.createTransfer(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Transfer created', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function approveTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.approveTransfer(req.params.id, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Transfer approved', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function rejectTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.rejectTransfer(req.params.id, req.body.reason, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Transfer rejected', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function dispatchTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.dispatchTransfer(req.params.id, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Dispatched — stock deducted from source', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function receiveTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.receiveTransfer(req.params.id, req.body.items, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Stock received at destination', data: { transfer: t } });
  } catch (e) { next(e); }
}

export async function cancelTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const t = await stockService.cancelTransfer(req.params.id, req.body.reason, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Transfer cancelled', data: { transfer: t } });
  } catch (e) { next(e); }
}
