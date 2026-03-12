import { Request, Response, NextFunction } from 'express';
import { brandService } from './brand.service';
import respond from '../../shared/utils/response';

export async function getBrands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await brandService.getBrands(req.query as Record<string,string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, result.data, result.pagination);
  } catch (e) { next(e); }
}

export async function getBrandById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brand = await brandService.getBrandById(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Brand retrieved', data: { brand } });
  } catch (e) { next(e); }
}

export async function createBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brand = await brandService.createBrand(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Brand created', data: { brand } });
  } catch (e) { next(e); }
}

export async function updateBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brand = await brandService.updateBrand(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Brand updated', data: { brand } });
  } catch (e) { next(e); }
}

export async function deleteBrand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await brandService.deleteBrand(req.params.id, req.user?.tenantId ?? 'default');
    respond.noContent(res);
  } catch (e) { next(e); }
}

export async function getBrandStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await brandService.getBrandStats(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Stats retrieved', data: { stats } });
  } catch (e) { next(e); }
}
