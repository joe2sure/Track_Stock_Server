import { Request, Response, NextFunction } from 'express';
import { reportService } from './report.service';
import respond from '../../shared/utils/response';

export async function getDashboardOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getDashboardOverview(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Dashboard overview', data });
  } catch (e) { next(e); }
}

export async function getSalesReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getSalesReport(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Sales report', data });
  } catch (e) { next(e); }
}

export async function getProfitLoss(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getProfitLoss(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Profit & Loss statement', data });
  } catch (e) { next(e); }
}

export async function getStockValuation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getStockValuation(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Stock valuation report', data });
  } catch (e) { next(e); }
}

export async function getPurchasesReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getPurchasesReport(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Purchases report', data });
  } catch (e) { next(e); }
}

export async function getHotelReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getHotelReport(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Hotel occupancy report', data });
  } catch (e) { next(e); }
}

export async function getExpenseReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getExpenseReport(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Expense report', data });
  } catch (e) { next(e); }
}

export async function getLowStockReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await reportService.getLowStockProducts(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Low stock report', data: { items, count: items.length } });
  } catch (e) { next(e); }
}
