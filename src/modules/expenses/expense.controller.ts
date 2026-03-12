import { Request, Response, NextFunction } from 'express';
import { expenseService } from './expense.service';
import respond from '../../shared/utils/response';

export async function getExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await expenseService.getExpenses(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Expenses retrieved');
  } catch (e) { next(e); }
}

export async function getExpenseById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.getExpenseById(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Expense retrieved', data: { expense } });
  } catch (e) { next(e); }
}

export async function getExpenseStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await expenseService.getExpenseStats(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Expense stats', data: { stats } });
  } catch (e) { next(e); }
}

export async function getExpenseCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await expenseService.getCategories(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Expense categories', data: { categories } });
  } catch (e) { next(e); }
}

export async function createExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.createExpense(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Expense created', data: { expense } });
  } catch (e) { next(e); }
}

export async function updateExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.updateExpense(req.params.id, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Expense updated', data: { expense } });
  } catch (e) { next(e); }
}

export async function submitExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.submitExpense(req.params.id, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Expense submitted for approval', data: { expense } });
  } catch (e) { next(e); }
}

export async function reviewExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { action, reviewNotes } = req.body;
    const expense = await expenseService.reviewExpense(req.params.id, action, reviewNotes, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: `Expense ${action}d`, data: { expense } });
  } catch (e) { next(e); }
}

export async function payExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.payExpense(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Expense marked as paid', data: { expense } });
  } catch (e) { next(e); }
}

export async function cancelExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const expense = await expenseService.cancelExpense(req.params.id, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Expense cancelled', data: { expense } });
  } catch (e) { next(e); }
}
