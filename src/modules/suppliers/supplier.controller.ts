import { Request, Response, NextFunction } from 'express';
import { supplierService } from './supplier.service';
import respond from '../../shared/utils/response';

export async function getSuppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await supplierService.getSuppliers(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Suppliers retrieved');
  } catch (e) { next(e); }
}

export async function getSupplierById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Supplier retrieved', data: { supplier } });
  } catch (e) { next(e); }
}

export async function getSupplierStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await supplierService.getSupplierStats(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Supplier stats', data: { stats } });
  } catch (e) { next(e); }
}

export async function createSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const supplier = await supplierService.createSupplier(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Supplier created', data: { supplier } });
  } catch (e) { next(e); }
}

export async function updateSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const supplier = await supplierService.updateSupplier(req.params.id as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Supplier updated', data: { supplier } });
  } catch (e) { next(e); }
}

export async function deleteSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await supplierService.deleteSupplier(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.noContent(res);
  } catch (e) { next(e); }
}
