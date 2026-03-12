import cron from 'node-cron';
import Settings from '../settings/settings.model';
import User from '../users/user.model';
import { reportService } from '../reports/report.service';
import { emailService } from './email.service';
import { smsService } from './sms.service';
import { assetService } from '../assets/asset.service';
import { emitToTenant } from '../../server';
import logger from '../../config/logger';

// ── Utility: get all active tenants ──────────────────────────────────────────
async function getAllTenants(): Promise<string[]> {
  const settings = await Settings.find({}).select('tenantId').lean();
  return settings.map(s => s.tenantId);
}

// ── 1. Daily sales summary email ─────────────────────────────────────────────
// Runs every day at the time configured in settings (default 08:00 WAT)
async function sendDailySummaries(): Promise<void> {
  logger.info('[Scheduler] Running daily summary job');
  const tenants = await getAllTenants();

  for (const tenantId of tenants) {
    try {
      const settings = await Settings.findOne({ tenantId });
      if (!settings?.notifications?.dailySummaryEmail) continue;

      // Get admin/manager emails
      const recipients = await User.find({
        tenantId,
        role: { $in: ['super_admin', 'admin', 'manager'] },
        isActive: true,
        isEmailVerified: true,
      }).select('email name').lean();

      if (!recipients.length) continue;

      // Yesterday's summary
      const yesterday = new Date(Date.now() - 86_400_000);
      const yStr      = yesterday.toISOString().split('T')[0];

      const report = await reportService.getSalesReport(
        { from: yStr, to: yStr },
        tenantId
      );

      const summary = {
        date:         yesterday.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        totalSales:   report.summary.totalOrders,
        totalOrders:  report.summary.totalOrders,
        totalRevenue: report.summary.totalRevenue,
        topProduct:   report.topProducts[0]?.name ?? 'N/A',
      };

      for (const user of recipients) {
        await emailService.sendDailySalesSummary(user.email, summary);
      }

      logger.info(`[Scheduler] Daily summary sent for tenant ${tenantId} to ${recipients.length} recipients`);
    } catch (err) {
      logger.error(`[Scheduler] Daily summary failed for ${tenantId}: ${(err as Error).message}`);
    }
  }
}

// ── 2. Low stock alerts ───────────────────────────────────────────────────────
// Runs every day at 07:00
async function sendLowStockAlerts(): Promise<void> {
  logger.info('[Scheduler] Running low-stock alert job');
  const tenants = await getAllTenants();

  for (const tenantId of tenants) {
    try {
      const settings = await Settings.findOne({ tenantId });
      if (!settings?.notifications?.lowStockAlerts) continue;

      const lowStockItems = await reportService.getLowStockProducts(tenantId);
      if (!lowStockItems.length) continue;

      // Emit WebSocket event to all connected clients in this tenant
      emitToTenant(tenantId, 'low_stock_alert', {
        count:    lowStockItems.length,
        products: lowStockItems.slice(0, 5),   // Preview first 5
      });

      // Email alert
      if (settings.notifications.emailAlerts) {
        const admins = await User.find({
          tenantId,
          role: { $in: ['super_admin', 'admin', 'manager'] },
          isActive: true,
          isEmailVerified: true,
        }).select('email').lean();

        for (const admin of admins) {
          await emailService.sendLowStockAlert(admin.email, lowStockItems);
        }
      }

      // SMS alert (only if enabled and phone on file)
      if (settings.notifications.smsAlerts) {
        const admins = await User.find({
          tenantId,
          role: { $in: ['super_admin', 'admin'] },
          isActive: true,
          phone: { $exists: true, $ne: '' },
        }).select('phone').lean();

        for (const admin of admins) {
          if (admin.phone) {
            await smsService.sendLowStockSms(admin.phone, lowStockItems.length);
          }
        }
      }

      logger.info(`[Scheduler] Low-stock alerts sent for tenant ${tenantId}: ${lowStockItems.length} products`);
    } catch (err) {
      logger.error(`[Scheduler] Low-stock alert failed for ${tenantId}: ${(err as Error).message}`);
    }
  }
}

// ── 3. Depreciation refresh ───────────────────────────────────────────────────
// Runs every Sunday at 02:00 AM
async function refreshDepreciation(): Promise<void> {
  logger.info('[Scheduler] Running depreciation refresh job');
  const tenants = await getAllTenants();

  for (const tenantId of tenants) {
    try {
      const result = await assetService.refreshDepreciation(tenantId);
      if (result.updated > 0) {
        logger.info(`[Scheduler] Depreciation refreshed for ${tenantId}: ${result.updated} assets`);
      }
    } catch (err) {
      logger.error(`[Scheduler] Depreciation refresh failed for ${tenantId}: ${(err as Error).message}`);
    }
  }
}

// ── 4. Hotel overdue checkout alerts ─────────────────────────────────────────
// Runs every day at 12:00 (noon)
async function alertOverdueCheckouts(): Promise<void> {
  logger.info('[Scheduler] Checking overdue checkouts');
  const tenants = await getAllTenants();

  for (const tenantId of tenants) {
    try {
      const Booking = (await import('../hotel/booking.model')).default;
      const overdue = await Booking.find({
        tenantId,
        status:      'checked_in',
        checkOutDate: { $lt: new Date() },
      }).select('bookingNumber roomNumber guests').lean();

      if (overdue.length) {
        emitToTenant(tenantId, 'overdue_checkouts', {
          count:    overdue.length,
          bookings: overdue.map(b => ({
            bookingNumber: b.bookingNumber,
            roomNumber:    b.roomNumber,
            guestName:     b.guests[0]?.name ?? 'Unknown',
          })),
        });
        logger.info(`[Scheduler] ${overdue.length} overdue checkout(s) for tenant ${tenantId}`);
      }
    } catch (err) {
      logger.error(`[Scheduler] Overdue checkout check failed for ${tenantId}: ${(err as Error).message}`);
    }
  }
}

// ── Register all cron jobs ────────────────────────────────────────────────────
export function startScheduler(): void {
  // Daily summary — 08:00 WAT daily
  cron.schedule('0 8 * * *', sendDailySummaries, { timezone: 'Africa/Lagos' });
  logger.info('[Scheduler] Daily summary job registered (08:00 WAT)');

  // Low stock alerts — 07:00 WAT daily
  cron.schedule('0 7 * * *', sendLowStockAlerts, { timezone: 'Africa/Lagos' });
  logger.info('[Scheduler] Low-stock alert job registered (07:00 WAT)');

  // Depreciation refresh — Sunday 02:00 WAT
  cron.schedule('0 2 * * 0', refreshDepreciation, { timezone: 'Africa/Lagos' });
  logger.info('[Scheduler] Depreciation refresh job registered (Sun 02:00 WAT)');

  // Overdue checkout alerts — 12:00 WAT daily
  cron.schedule('0 12 * * *', alertOverdueCheckouts, { timezone: 'Africa/Lagos' });
  logger.info('[Scheduler] Overdue checkout job registered (12:00 WAT)');
}

// ── Manual triggers (for testing / admin endpoints) ───────────────────────────
export const schedulerJobs = {
  runDailySummaries:      sendDailySummaries,
  runLowStockAlerts:      sendLowStockAlerts,
  runDepreciationRefresh: refreshDepreciation,
  runOverdueCheckouts:    alertOverdueCheckouts,
};
