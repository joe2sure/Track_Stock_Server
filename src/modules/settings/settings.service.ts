import Settings, { ISettings } from './settings.model';
import { getOrSet, deleteCache, CachePrefix } from '../../shared/utils/cache';
import { roleService } from '../roles/role.service';
import { currencyService } from '../currencies/currency.service';
import logger from '../../config/logger';

export class SettingsService {

  // ── Get or create settings for tenant ─────────────────────────────────────
  async getSettings(tenantId: string): Promise<ISettings> {
    return getOrSet(`settings:${tenantId}`, async () => {
      let s = await Settings.findOne({ tenantId });
      if (!s) {
        s = await Settings.create({ tenantId });
        logger.info(`Default settings created for tenant: ${tenantId}`);
      }
      return s;
    }, { prefix: CachePrefix.DASHBOARD, ttl: 600 });
  }

  // ── Update entire settings or specific sections ───────────────────────────
  async updateSettings(
    section: 'businessInfo' | 'tax' | 'receipt' | 'invoice' | 'pos'
           | 'notifications' | 'hotel' | 'general' | 'all',
    data: Partial<ISettings>,
    tenantId: string,
    userId: string
  ): Promise<ISettings> {
    const existing = await Settings.findOne({ tenantId });

    let updatePayload: Record<string, unknown> = { updatedBy: userId };

    if (section === 'all' || section === 'general') {
      // Merge top-level general fields
      const { timezone, dateFormat, timeFormat, fiscalYearStart, baseCurrency } = data as Partial<ISettings>;
      if (timezone)        updatePayload.timezone        = timezone;
      if (dateFormat)      updatePayload.dateFormat      = dateFormat;
      if (timeFormat)      updatePayload.timeFormat      = timeFormat;
      if (fiscalYearStart) updatePayload.fiscalYearStart = fiscalYearStart;
      if (baseCurrency)    updatePayload.baseCurrency    = baseCurrency;
    }

    if (section === 'all' || section !== 'general') {
      const sectionData = (data as Record<string, unknown>)[section];
      if (section !== 'all' && sectionData && typeof sectionData === 'object') {
        // Dot-notation merge for the specific section
        for (const [key, val] of Object.entries(sectionData as Record<string, unknown>)) {
          updatePayload[`${section}.${key}`] = val;
        }
      } else if (section === 'all') {
        // Full replace of all sections
        const { businessInfo, tax, receipt, invoice, pos, notifications, hotel } = data as Partial<ISettings>;
        if (businessInfo)  updatePayload.businessInfo  = businessInfo;
        if (tax)           updatePayload.tax           = tax;
        if (receipt)       updatePayload.receipt       = receipt;
        if (invoice)       updatePayload.invoice       = invoice;
        if (pos)           updatePayload.pos           = pos;
        if (notifications) updatePayload.notifications = notifications;
        if (hotel)         updatePayload.hotel         = hotel;
      }
    }

    const updated = await Settings.findOneAndUpdate(
      { tenantId },
      { $set: updatePayload },
      { new: true, upsert: true, runValidators: true }
    );

    await deleteCache(`settings:${tenantId}`, CachePrefix.DASHBOARD);
    logger.info(`Settings updated section="${section}" by ${userId}`);
    return updated!;
  }

  // ── Bootstrap new tenant ───────────────────────────────────────────────────
  async bootstrapTenant(
    tenantId: string,
    businessName: string,
    userId: string
  ): Promise<{ settings: ISettings; message: string }> {
    // Create settings
    let settings = await Settings.findOne({ tenantId });
    if (!settings) {
      settings = await Settings.create({
        tenantId,
        businessInfo: { name: businessName, country: 'Nigeria' },
      });
    }

    // Seed system roles
    await roleService.seedSystemRoles(tenantId, userId);

    // Seed default currencies (NGN as base)
    await currencyService.seedDefaults(tenantId, userId);

    await deleteCache(`settings:${tenantId}`, CachePrefix.DASHBOARD);

    logger.info(`Tenant bootstrapped: ${tenantId} businessName="${businessName}"`);
    return { settings, message: 'Tenant bootstrapped with default roles and currencies' };
  }

  // ── Reset invoice number counter ─────────────────────────────────────────
  async resetInvoiceCounter(tenantId: string, nextNumber: number, userId: string): Promise<ISettings> {
    if (nextNumber < 1) throw new Error('Invoice number must be >= 1');
    const updated = await Settings.findOneAndUpdate(
      { tenantId },
      { $set: { 'invoice.nextNumber': nextNumber, updatedBy: userId } },
      { new: true, upsert: true }
    );
    await deleteCache(`settings:${tenantId}`, CachePrefix.DASHBOARD);
    return updated!;
  }

  // ── Increment invoice number atomically ──────────────────────────────────
  async nextInvoiceNumber(tenantId: string): Promise<string> {
    const settings = await Settings.findOneAndUpdate(
      { tenantId },
      { $inc: { 'invoice.nextNumber': 1 } },
      { new: false, upsert: true }  // Return old value before increment
    );
    const prefix = settings?.invoice?.prefix ?? 'INV';
    const num    = settings?.invoice?.nextNumber ?? 1000;
    return `${prefix}-${String(num).padStart(5, '0')}`;
  }
}

export const settingsService = new SettingsService();
