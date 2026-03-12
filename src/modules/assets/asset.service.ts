import { Types } from 'mongoose';
import Asset, { IAsset, IAssetMaintenance } from './asset.model';
import Staff from '../staff/staff.model';
import {
  parsePagination, buildPaginationMeta, buildSearchQuery,
} from '../../shared/utils/pagination';
import { getOrSet, CachePrefix } from '../../shared/utils/cache';
import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import logger from '../../config/logger';

// ── Number generator ─────────────────────────────────────────────────────────
async function genAssetNumber(tenantId: string): Promise<string> {
  const count = await Asset.countDocuments({ tenantId });
  return `AST-${String(count + 1).padStart(4, '0')}`;
}

// ── Depreciation calculator ───────────────────────────────────────────────────
function calcCurrentValue(asset: Pick<IAsset, 'purchaseCost' | 'salvageValue' | 'usefulLifeYears' | 'purchaseDate' | 'depreciationMethod' | 'depreciationRate'>): number {
  if (asset.depreciationMethod === 'none') return asset.purchaseCost;

  const ageYears = (Date.now() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (asset.depreciationMethod === 'straight_line') {
    const annualDep = (asset.purchaseCost - asset.salvageValue) / Math.max(1, asset.usefulLifeYears);
    return Math.max(asset.salvageValue, asset.purchaseCost - annualDep * ageYears);
  }

  // Reducing balance
  const rate   = asset.depreciationRate / 100;
  const value  = asset.purchaseCost * Math.pow(1 - rate, ageYears);
  return Math.max(asset.salvageValue, value);
}

export class AssetService {

  async getAssets(
    query: PaginationQuery & { category?: string; status?: string; assignedTo?: string; warehouseId?: string },
    tenantId: string
  ): Promise<PaginatedResult<IAsset>> {
    const { page, limit, skip, sort } = parsePagination(query, 'name');
    const filter: Record<string, unknown> = { tenantId };
    if (query.category)    filter.category    = query.category;
    if (query.status)      filter.status      = query.status;
    if (query.assignedTo)  filter.assignedTo  = query.assignedTo;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['name','assetNumber','serialNumber','category']));

    const [data, total] = await Promise.all([
      Asset.find(filter)
        .populate('assignedTo', 'firstName lastName staffNumber')
        .populate('warehouseId', 'name code')
        .populate('supplierId', 'name')
        .sort(sort).skip(skip).limit(limit).lean(),
      Asset.countDocuments(filter),
    ]);
    return { data: data as IAsset[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getAssetById(id: string, tenantId: string): Promise<IAsset> {
    const a = await Asset.findOne({ _id: id, tenantId })
      .populate('assignedTo', 'firstName lastName staffNumber department')
      .populate('warehouseId', 'name code')
      .populate('supplierId', 'name phone')
      .populate('createdBy', 'name');
    if (!a) throw new NotFoundError('Asset');
    return a;
  }

  async createAsset(input: Partial<IAsset>, tenantId: string, userId: string): Promise<IAsset> {
    const assetNumber  = await genAssetNumber(tenantId);
    const purchaseCost = input.purchaseCost ?? 0;
    const currentValue = calcCurrentValue({
      purchaseCost,
      salvageValue:       input.salvageValue ?? 0,
      usefulLifeYears:    input.usefulLifeYears ?? 5,
      purchaseDate:       new Date(input.purchaseDate ?? Date.now()),
      depreciationMethod: input.depreciationMethod ?? 'straight_line',
      depreciationRate:   input.depreciationRate ?? 20,
    });

    return Asset.create({ ...input, assetNumber, currentValue, tenantId, createdBy: userId });
  }

  async updateAsset(id: string, input: Partial<IAsset>, tenantId: string): Promise<IAsset> {
    const asset = await Asset.findOneAndUpdate(
      { _id: id, tenantId }, input, { new: true, runValidators: true }
    );
    if (!asset) throw new NotFoundError('Asset');
    return asset;
  }

  async assignAsset(
    id: string,
    input: { assignedTo: string; location?: string },
    tenantId: string
  ): Promise<IAsset> {
    const asset = await Asset.findOne({ _id: id, tenantId });
    if (!asset) throw new NotFoundError('Asset');
    if (asset.status !== 'active') throw new BadRequestError(`Cannot assign an asset with status "${asset.status}"`);

    const staff = await Staff.findOne({ _id: input.assignedTo, tenantId });
    if (!staff) throw new NotFoundError('Staff member');

    return Asset.findByIdAndUpdate(id, {
      assignedTo: input.assignedTo,
      assignedAt: new Date(),
      ...(input.location && { location: input.location }),
    }, { new: true }) as Promise<IAsset>;
  }

  async unassignAsset(id: string, tenantId: string): Promise<IAsset> {
    const asset = await Asset.findOneAndUpdate(
      { _id: id, tenantId },
      { $unset: { assignedTo: '', assignedAt: '' } },
      { new: true }
    );
    if (!asset) throw new NotFoundError('Asset');
    return asset;
  }

  async addMaintenance(
    id: string,
    input: { date: Date; description: string; cost?: number; vendor?: string; nextDueDate?: Date },
    tenantId: string,
    userId: string
  ): Promise<IAsset> {
    const asset = await Asset.findOne({ _id: id, tenantId });
    if (!asset) throw new NotFoundError('Asset');

    const record: Omit<IAssetMaintenance, '_id'> = {
      date:        new Date(input.date),
      description: input.description,
      cost:        input.cost ?? 0,
      vendor:      input.vendor,
      nextDueDate: input.nextDueDate,
      performedBy: new Types.ObjectId(userId),
    };

    const update: Record<string, unknown> = { $push: { maintenanceHistory: record } };
    if (input.nextDueDate) update.$set = { nextMaintenanceDate: input.nextDueDate };

    const updated = await Asset.findByIdAndUpdate(id, update, { new: true });
    logger.info(`Maintenance logged for asset ${asset.assetNumber}: ${input.description}`);
    return updated!;
  }

  async disposeAsset(
    id: string,
    input: { disposalDate: Date; disposalValue?: number; disposalReason: string },
    tenantId: string
  ): Promise<IAsset> {
    const asset = await Asset.findOne({ _id: id, tenantId });
    if (!asset) throw new NotFoundError('Asset');
    if (asset.status === 'disposed') throw new BadRequestError('Asset is already disposed');

    return Asset.findByIdAndUpdate(id, {
      status:         'disposed',
      disposalDate:   input.disposalDate,
      disposalValue:  input.disposalValue ?? 0,
      disposalReason: input.disposalReason,
      isActive:       false,
      $unset:         { assignedTo: '', assignedAt: '' },
    }, { new: true }) as Promise<IAsset>;
  }

  async updateAssetStatus(
    id: string,
    input: { status: IAsset['status']; notes?: string },
    tenantId: string
  ): Promise<IAsset> {
    const asset = await Asset.findOneAndUpdate(
      { _id: id, tenantId },
      { status: input.status, ...(input.notes && { notes: input.notes }) },
      { new: true }
    );
    if (!asset) throw new NotFoundError('Asset');
    return asset;
  }

  async refreshDepreciation(tenantId: string): Promise<{ updated: number }> {
    const assets = await Asset.find({ tenantId, status: 'active', depreciationMethod: { $ne: 'none' } });
    let updated  = 0;
    for (const asset of assets) {
      const newValue = calcCurrentValue(asset);
      if (Math.abs(newValue - (asset.currentValue ?? asset.purchaseCost)) > 0.01) {
        await Asset.findByIdAndUpdate(asset._id, { currentValue: newValue });
        updated++;
      }
    }
    logger.info(`Depreciation refreshed: ${updated} assets updated for tenant ${tenantId}`);
    return { updated };
  }

  async getAssetStats(tenantId: string) {
    return getOrSet(`assets:stats:${tenantId}`, async () => {
      const [byStatus, byCategory, totalValue, maintenanceDue] = await Promise.all([
        Asset.aggregate([{ $match: { tenantId } }, { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$currentValue' } } }]),
        Asset.aggregate([{ $match: { tenantId, isActive: true } }, { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$currentValue' } } }, { $sort: { value: -1 } }]),
        Asset.aggregate([{ $match: { tenantId, isActive: true } }, { $group: { _id: null, cost: { $sum: '$purchaseCost' }, current: { $sum: '$currentValue' } } }]),
        Asset.countDocuments({ tenantId, isActive: true, nextMaintenanceDate: { $lte: new Date(Date.now() + 7 * 86_400_000) } }),
      ]);

      const tv = totalValue[0] ?? { cost: 0, current: 0 };
      return {
        totalAssets:              await Asset.countDocuments({ tenantId }),
        activeAssets:             byStatus.find(s => s._id === 'active')?.count ?? 0,
        totalPurchaseCost:        tv.cost,
        totalCurrentValue:        tv.current,
        totalDepreciation:        tv.cost - tv.current,
        maintenanceDueSoon:       maintenanceDue,
        byStatus:                 Object.fromEntries(byStatus.map(s => [s._id, { count: s.count, value: s.value }])),
        byCategory,
      };
    }, { prefix: CachePrefix.DASHBOARD, ttl: 600 });
  }

  async getCategories(tenantId: string): Promise<string[]> {
    return Asset.distinct('category', { tenantId });
  }
}

export const assetService = new AssetService();
