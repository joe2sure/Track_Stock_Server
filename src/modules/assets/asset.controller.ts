import { Request, Response, NextFunction } from 'express';
import { assetService } from './asset.service';
import respond from '../../shared/utils/response';

export async function getAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await assetService.getAssets(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Assets retrieved');
  } catch (e) { next(e); }
}

export async function getAssetById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.getAssetById(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset retrieved', data: { asset } });
  } catch (e) { next(e); }
}

export async function getAssetStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await assetService.getAssetStats(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset stats', data: { stats } });
  } catch (e) { next(e); }
}

export async function getAssetCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await assetService.getCategories(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset categories', data: { categories } });
  } catch (e) { next(e); }
}

export async function createAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.createAsset(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Asset registered', data: { asset } });
  } catch (e) { next(e); }
}

export async function updateAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.updateAsset(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset updated', data: { asset } });
  } catch (e) { next(e); }
}

export async function assignAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.assignAsset(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset assigned', data: { asset } });
  } catch (e) { next(e); }
}

export async function unassignAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.unassignAsset(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset unassigned', data: { asset } });
  } catch (e) { next(e); }
}

export async function addMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.addMaintenance(req.params.id, req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'Maintenance record added', data: { asset } });
  } catch (e) { next(e); }
}

export async function disposeAsset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.disposeAsset(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset disposed', data: { asset } });
  } catch (e) { next(e); }
}

export async function updateAssetStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const asset = await assetService.updateAssetStatus(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Asset status updated', data: { asset } });
  } catch (e) { next(e); }
}

export async function refreshDepreciation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await assetService.refreshDepreciation(req.user?.tenantId ?? 'default');
    respond.success(res, { message: `Depreciation refreshed: ${result.updated} assets updated`, data: result });
  } catch (e) { next(e); }
}
