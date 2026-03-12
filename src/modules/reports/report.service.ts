import mongoose from 'mongoose';
import Sale from '../sales/sale.model';
import Customer from '../sales/customer.model';
import Purchase from '../purchases/purchaseOrder.model';
import Product from '../products/product.model';
import StockLevel from '../stock/stockLevel.model';
import StockMovement from '../stock/stockMovement.model';
import Booking from '../hotel/booking.model';
import Room from '../hotel/room.model';
import Expense from '../expenses/expense.model';
import Staff from '../staff/staff.model';
import { getOrSet, CachePrefix } from '../../shared/utils/cache';
import logger from '../../config/logger';

// ── Date helpers ─────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d: Date): Date   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

function parseDateRange(from?: string, to?: string): { start: Date; end: Date } {
  const end   = to   ? endOfDay(new Date(to))   : endOfDay(new Date());
  const start = from ? startOfDay(new Date(from)) : startOfDay(new Date(Date.now() - 29 * 86_400_000));
  return { start, end };
}

export class ReportService {

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SALES REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  async getSalesReport(
    query: {
      from?: string; to?: string; warehouseId?: string;
      groupBy?: 'day' | 'week' | 'month'; cashierId?: string;
    },
    tenantId: string
  ) {
    const { start, end } = parseDateRange(query.from, query.to);
    const groupBy = query.groupBy ?? 'day';

    const match: Record<string, unknown> = {
      tenantId,
      status:    { $in: ['completed', 'partial_return'] },
      createdAt: { $gte: start, $lte: end },
    };
    if (query.warehouseId) match.warehouseId = query.warehouseId;
    if (query.cashierId)   match.createdBy   = new mongoose.Types.ObjectId(query.cashierId);

    const dateFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-W%V' : '%Y-%m-%d';

    const [trend, paymentBreakdown, topProducts, topCustomers, summary, hourlyDistribution] = await Promise.all([
      // Revenue trend
      Sale.aggregate([
        { $match: match },
        { $group: {
          _id:      { $dateToString: { format: dateFormat, date: '$createdAt' } },
          revenue:  { $sum: '$totalAmount' },
          cost:     { $sum: { $sum: '$items.costPrice' } },
          orders:   { $sum: 1 },
          items:    { $sum: { $sum: '$items.quantity' } },
          discount: { $sum: '$discountAmount' },
          tax:      { $sum: '$taxAmount' },
        }},
        { $sort: { _id: 1 } },
      ]),

      // Payment method breakdown
      Sale.aggregate([
        { $match: match },
        { $unwind: '$payments' },
        { $group: { _id: '$payments.method', total: { $sum: '$payments.amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      // Top 10 products by revenue
      Sale.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: {
          _id:      '$items.productId',
          name:     { $first: '$items.name' },
          sku:      { $first: '$items.sku' },
          qty:      { $sum: '$items.quantity' },
          revenue:  { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
          profit:   { $sum: { $multiply: ['$items.quantity', { $subtract: ['$items.unitPrice', '$items.costPrice'] }] } },
        }},
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),

      // Top 10 customers
      Sale.aggregate([
        { $match: { ...match, customerId: { $ne: null } } },
        { $group: {
          _id:     '$customerId',
          orders:  { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        }},
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        { $project: { orders: 1, revenue: 1, name: '$customer.name', phone: '$customer.phone' } },
      ]),

      // Summary totals
      Sale.aggregate([
        { $match: match },
        { $group: {
          _id:          null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders:  { $sum: 1 },
          totalItems:   { $sum: { $sum: '$items.quantity' } },
          totalDiscount:{ $sum: '$discountAmount' },
          totalTax:     { $sum: '$taxAmount' },
          totalCost:    { $sum: '$costTotal' },
          avgOrderValue:{ $avg: '$totalAmount' },
        }},
      ]),

      // Hourly distribution (for today or short ranges)
      Sale.aggregate([
        { $match: match },
        { $group: {
          _id:   { $hour: '$createdAt' },
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    const s = summary[0] ?? { totalRevenue: 0, totalOrders: 0, totalItems: 0, totalDiscount: 0, totalTax: 0, totalCost: 0, avgOrderValue: 0 };
    const grossProfit = s.totalRevenue - s.totalCost;
    const profitMargin = s.totalRevenue > 0 ? parseFloat(((grossProfit / s.totalRevenue) * 100).toFixed(2)) : 0;

    return {
      period: { from: start, to: end, groupBy },
      summary: { ...s, grossProfit, profitMargin },
      trend,
      paymentBreakdown,
      topProducts,
      topCustomers,
      hourlyDistribution,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PROFIT & LOSS STATEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  async getProfitLoss(
    query: { from?: string; to?: string; warehouseId?: string },
    tenantId: string
  ) {
    const { start, end } = parseDateRange(query.from, query.to);

    const match: Record<string, unknown> = { tenantId, createdAt: { $gte: start, $lte: end } };
    if (query.warehouseId) match.warehouseId = query.warehouseId;

    const [salesData, purchaseData, expenseData, hotelData] = await Promise.all([
      // Revenue & COGS from sales
      Sale.aggregate([
        { $match: { ...match, status: { $in: ['completed', 'partial_return'] } } },
        { $group: {
          _id:      null,
          revenue:  { $sum: '$totalAmount' },
          cogs:     { $sum: '$costTotal' },
          discount: { $sum: '$discountAmount' },
          tax:      { $sum: '$taxAmount' },
          returns:  { $sum: { $cond: [{ $eq: ['$type', 'return'] }, '$totalAmount', 0] } },
        }},
      ]),

      // Purchase costs (received GRNs)
      Purchase.aggregate([
        { $match: { ...match, status: { $in: ['received', 'partial', 'closed'] } } },
        { $group: { _id: null, totalPurchased: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),

      // Operating expenses by category
      Expense.aggregate([
        { $match: { ...match, status: { $in: ['approved', 'paid'] } } },
        { $group: {
          _id:   '$category',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        }},
        { $sort: { total: -1 } },
      ]),

      // Hotel revenue
      Booking.aggregate([
        { $match: { ...match, status: { $in: ['checked_in', 'checked_out'] } } },
        { $group: {
          _id:     null,
          revenue: { $sum: '$totalAmount' },
          paid:    { $sum: '$amountPaid' },
          rooms:   { $sum: 1 },
        }},
      ]),
    ]);

    const sales    = salesData[0]    ?? { revenue: 0, cogs: 0, discount: 0, tax: 0, returns: 0 };
    const hotel    = hotelData[0]    ?? { revenue: 0, paid: 0, rooms: 0 };
    const expenses = expenseData;
    const totalExpenses = expenses.reduce((s: number, e: { total: number }) => s + e.total, 0);

    const grossRevenue    = sales.revenue + hotel.revenue;
    const grossProfit     = grossRevenue - sales.cogs;
    const operatingProfit = grossProfit - totalExpenses;
    const netProfit       = operatingProfit - sales.tax;

    return {
      period: { from: start, to: end },
      income: {
        salesRevenue:    sales.revenue,
        hotelRevenue:    hotel.revenue,
        grossRevenue,
        salesReturns:    sales.returns,
        netRevenue:      grossRevenue - sales.returns,
      },
      costOfGoods: {
        openingStock:    0,     // Would need stock snapshot — left for future
        purchases:       purchaseData[0]?.totalPurchased ?? 0,
        closingStock:    0,
        cogs:            sales.cogs,
      },
      grossProfit,
      grossProfitMargin: grossRevenue > 0 ? parseFloat(((grossProfit / grossRevenue) * 100).toFixed(2)) : 0,
      operatingExpenses: {
        breakdown:    expenses,
        total:        totalExpenses,
      },
      operatingProfit,
      taxes:            sales.tax,
      netProfit,
      netProfitMargin:  grossRevenue > 0 ? parseFloat(((netProfit / grossRevenue) * 100).toFixed(2)) : 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. STOCK VALUATION REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  async getStockValuation(
    query: { warehouseId?: string; categoryId?: string; lowStockOnly?: string },
    tenantId: string
  ) {
    const stockMatch: Record<string, unknown> = { tenantId };
    if (query.warehouseId) stockMatch.warehouseId = query.warehouseId;

    const productMatch: Record<string, unknown> = { tenantId, isActive: true };
    if (query.categoryId) productMatch.categoryId = query.categoryId;
    if (query.lowStockOnly === 'true') productMatch.$expr = { $lte: ['$quantity', '$minStockLevel'] };

    const [stockData, movements30d, summary] = await Promise.all([
      // Stock levels joined with product info
      StockLevel.aggregate([
        { $match: stockMatch },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.isActive': true, ...(query.categoryId ? { 'product.categoryId': new mongoose.Types.ObjectId(query.categoryId) } : {}) } },
        { $lookup: { from: 'warehouses', localField: 'warehouseId', foreignField: '_id', as: 'warehouse' } },
        { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
        { $project: {
          productId:      1,
          warehouseId:    1,
          sku:            '$product.sku',
          productName:    '$product.name',
          warehouseName:  '$warehouse.name',
          quantity:       1,
          reservedQty:    '$reservedQuantity',
          availableQty:   { $subtract: ['$quantity', '$reservedQuantity'] },
          costPrice:      '$product.costPrice',
          sellingPrice:   '$product.sellingPrice',
          minStockLevel:  1,
          reorderPoint:   1,
          costValue:      { $multiply: ['$quantity', '$product.costPrice'] },
          retailValue:    { $multiply: ['$quantity', '$product.sellingPrice'] },
          isLow:          { $lte: ['$quantity', '$minStockLevel'] },
          needsReorder:   { $lte: ['$quantity', '$reorderPoint'] },
        }},
        { $sort: { costValue: -1 } },
      ]),

      // Movement velocity — units sold in last 30 days
      StockMovement.aggregate([
        { $match: {
          tenantId,
          type:      'sale',
          createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        }},
        { $group: { _id: '$productId', sold30d: { $sum: { $abs: '$quantity' } } } },
      ]),

      // Summary totals
      StockLevel.aggregate([
        { $match: stockMatch },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.isActive': true } },
        { $group: {
          _id:           null,
          totalSkus:     { $sum: 1 },
          totalUnits:    { $sum: '$quantity' },
          totalCostVal:  { $sum: { $multiply: ['$quantity', '$product.costPrice'] } },
          totalRetailVal:{ $sum: { $multiply: ['$quantity', '$product.sellingPrice'] } },
          lowStockCount: { $sum: { $cond: [{ $lte: ['$quantity', '$minStockLevel'] }, 1, 0] } },
          outOfStock:    { $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] } },
        }},
      ]),
    ]);

    // Merge velocity into stock items
    const velocityMap = new Map(movements30d.map((m: { _id: unknown; sold30d: number }) => [m._id?.toString(), m.sold30d]));
    const enriched = stockData.map((item: Record<string, unknown>) => ({
      ...item,
      sold30d:      velocityMap.get((item.productId as { toString(): string })?.toString()) ?? 0,
      daysOfStock:  (item.quantity as number) > 0 && (velocityMap.get((item.productId as { toString(): string })?.toString()) ?? 0) > 0
        ? parseFloat(((item.quantity as number) / ((velocityMap.get((item.productId as { toString(): string })?.toString()) ?? 0) / 30)).toFixed(1))
        : null,
    }));

    const s = summary[0] ?? { totalSkus: 0, totalUnits: 0, totalCostVal: 0, totalRetailVal: 0, lowStockCount: 0, outOfStock: 0 };
    const potentialProfit = s.totalRetailVal - s.totalCostVal;

    return {
      summary: { ...s, potentialProfit },
      items: enriched,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. PURCHASES REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  async getPurchasesReport(
    query: { from?: string; to?: string; supplierId?: string },
    tenantId: string
  ) {
    const { start, end } = parseDateRange(query.from, query.to);
    const match: Record<string, unknown> = { tenantId, createdAt: { $gte: start, $lte: end } };
    if (query.supplierId) match.supplierId = new mongoose.Types.ObjectId(query.supplierId);

    const [trend, bySupplier, byStatus, summary, topItems] = await Promise.all([
      // Monthly trend
      Purchase.aggregate([
        { $match: match },
        { $group: {
          _id:    { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          orders: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
          paid:   { $sum: '$amountPaid' },
        }},
        { $sort: { _id: 1 } },
      ]),

      // By supplier
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: '$supplierId', orders: { $sum: 1 }, amount: { $sum: '$totalAmount' }, paid: { $sum: '$amountPaid' } } },
        { $sort: { amount: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
        { $project: { orders: 1, amount: 1, paid: 1, name: '$supplier.name', balance: { $subtract: ['$amount', '$paid'] } } },
      ]),

      // By status
      Purchase.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
      ]),

      // Summary
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: null, orders: { $sum: 1 }, amount: { $sum: '$totalAmount' }, paid: { $sum: '$amountPaid' }, balance: { $sum: { $subtract: ['$totalAmount', '$amountPaid'] } } } },
      ]),

      // Top purchased items
      Purchase.aggregate([
        { $match: { ...match, status: { $in: ['received','partial','closed'] } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, qty: { $sum: '$items.receivedQuantity' }, amount: { $sum: { $multiply: ['$items.receivedQuantity', '$items.unitCost'] } } } },
        { $sort: { amount: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      period:     { from: start, to: end },
      summary:    summary[0] ?? { orders: 0, amount: 0, paid: 0, balance: 0 },
      trend,
      bySupplier,
      byStatus:   Object.fromEntries(byStatus.map((s: { _id: string; count: number; amount: number }) => [s._id, { count: s.count, amount: s.amount }])),
      topItems,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. HOTEL OCCUPANCY REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  async getHotelReport(
    query: { from?: string; to?: string },
    tenantId: string
  ) {
    const { start, end } = parseDateRange(query.from, query.to);
    const match: Record<string, unknown> = {
      tenantId,
      checkInDate: { $lte: end },
      checkOutDate: { $gte: start },
    };

    const totalRooms = await Room.countDocuments({ tenantId });
    const nights     = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const totalRoomNights = totalRooms * nights;

    const [occupancyTrend, byRoomType, bySource, revenueBreakdown, summary] = await Promise.all([
      // Daily occupancy
      Booking.aggregate([
        { $match: { ...match, status: { $in: ['checked_in','checked_out'] } } },
        { $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$checkInDate' } },
          rooms:   { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          guests:  { $sum: { $add: ['$adults', '$children'] } },
        }},
        { $sort: { _id: 1 } },
      ]),

      // By room type
      Booking.aggregate([
        { $match: { ...match, status: { $in: ['checked_in','checked_out'] } } },
        { $group: {
          _id:     '$roomTypeId',
          bookings:{ $sum: 1 },
          nights:  { $sum: '$nights' },
          revenue: { $sum: '$totalAmount' },
          avgRate: { $avg: '$ratePerNight' },
        }},
        { $lookup: { from: 'roomtypes', localField: '_id', foreignField: '_id', as: 'rt' } },
        { $unwind: { path: '$rt', preserveNullAndEmptyArrays: true } },
        { $project: { bookings: 1, nights: 1, revenue: 1, avgRate: 1, name: '$rt.name', code: '$rt.code' } },
      ]),

      // By booking source
      Booking.aggregate([
        { $match: { ...match, status: { $in: ['checked_in','checked_out','confirmed'] } } },
        { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { count: -1 } },
      ]),

      // Revenue breakdown (room vs extras)
      Booking.aggregate([
        { $match: { ...match, status: { $in: ['checked_in','checked_out'] } } },
        { $group: {
          _id:         null,
          roomRevenue: { $sum: '$roomCharges' },
          extraRevenue:{ $sum: '$extraCharges' },
          discounts:   { $sum: '$discountAmount' },
          taxes:       { $sum: '$taxAmount' },
          totalRevenue:{ $sum: '$totalAmount' },
          collected:   { $sum: '$amountPaid' },
          outstanding: { $sum: '$balanceDue' },
        }},
      ]),

      // Summary
      Booking.aggregate([
        { $match: { tenantId } },
        { $group: {
          _id:         '$status',
          count:       { $sum: 1 },
          revenue:     { $sum: '$totalAmount' },
        }},
      ]),
    ]);

    const rev = revenueBreakdown[0] ?? { roomRevenue: 0, extraRevenue: 0, discounts: 0, taxes: 0, totalRevenue: 0, collected: 0, outstanding: 0 };
    const occupiedNights = occupancyTrend.reduce((s: number, d: { rooms: number }) => s + d.rooms, 0);
    const occupancyRate  = totalRoomNights > 0 ? parseFloat(((occupiedNights / totalRoomNights) * 100).toFixed(1)) : 0;
    const revPAR         = totalRooms > 0 ? parseFloat((rev.totalRevenue / (totalRooms * nights)).toFixed(2)) : 0;
    const avgDailyRate   = occupiedNights > 0 ? parseFloat((rev.totalRevenue / occupiedNights).toFixed(2)) : 0;

    return {
      period:       { from: start, to: end, nights, totalRooms, totalRoomNights },
      kpis:         { occupancyRate, revPAR, avgDailyRate, occupiedNights },
      revenueBreakdown: rev,
      occupancyTrend,
      byRoomType,
      bySource,
      bookingStatus: Object.fromEntries(summary.map((s: { _id: string; count: number; revenue: number }) => [s._id, { count: s.count, revenue: s.revenue }])),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. EXPENSE REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  async getExpenseReport(
    query: { from?: string; to?: string; warehouseId?: string; category?: string },
    tenantId: string
  ) {
    const { start, end } = parseDateRange(query.from, query.to);
    const match: Record<string, unknown> = {
      tenantId,
      expenseDate: { $gte: start, $lte: end },
      status:      { $in: ['approved', 'paid'] },
    };
    if (query.warehouseId) match.warehouseId = query.warehouseId;
    if (query.category)    match.category    = query.category;

    const [trend, byCategory, bySubmitter, summary] = await Promise.all([
      Expense.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$expenseDate' } }, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        { $sort: { total: -1 } },
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: '$submittedBy', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, total: 1, name: '$user.name' } },
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$totalAmount', 0] } } } },
      ]),
    ]);

    return {
      period:      { from: start, to: end },
      summary:     summary[0] ?? { count: 0, total: 0, paid: 0 },
      trend,
      byCategory,
      bySubmitter,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. DASHBOARD OVERVIEW (combined KPIs)
  // ─────────────────────────────────────────────────────────────────────────────
  async getDashboardOverview(tenantId: string) {
    return getOrSet(`reports:overview:${tenantId}`, async () => {
      const today      = new Date();
      const startToday = startOfDay(today);
      const endToday   = endOfDay(today);
      const start30    = new Date(Date.now() - 30 * 86_400_000);
      const startPrev30= new Date(Date.now() - 60 * 86_400_000);

      const [
        todaySales, todayRevenue,
        month30Sales, month30Revenue,
        prev30Revenue,
        pendingPurchases,
        lowStockCount,
        activeBookings,
        pendingExpenses,
        staffCount,
      ] = await Promise.all([
        Sale.countDocuments({ tenantId, status: { $in: ['completed','partial_return'] }, createdAt: { $gte: startToday, $lte: endToday } }),
        Sale.aggregate([{ $match: { tenantId, status: { $in: ['completed','partial_return'] }, createdAt: { $gte: startToday, $lte: endToday } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Sale.countDocuments({ tenantId, status: { $in: ['completed','partial_return'] }, createdAt: { $gte: start30 } }),
        Sale.aggregate([{ $match: { tenantId, status: { $in: ['completed','partial_return'] }, createdAt: { $gte: start30 } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Sale.aggregate([{ $match: { tenantId, status: { $in: ['completed','partial_return'] }, createdAt: { $gte: startPrev30, $lte: start30 } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Purchase.countDocuments({ tenantId, status: { $in: ['sent','acknowledged','partial'] } }),
        StockLevel.countDocuments({ tenantId, $expr: { $lte: ['$quantity', '$minStockLevel'] } }),
        Booking.countDocuments({ tenantId, status: 'checked_in' }),
        Expense.countDocuments({ tenantId, status: 'submitted' }),
        Staff.countDocuments({ tenantId, isActive: true }),
      ]);

      const rev30   = month30Revenue[0]?.total  ?? 0;
      const revPrev = prev30Revenue[0]?.total   ?? 0;
      const revenueGrowth = revPrev > 0 ? parseFloat((((rev30 - revPrev) / revPrev) * 100).toFixed(1)) : null;

      return {
        today: {
          sales:   todaySales,
          revenue: todayRevenue[0]?.total ?? 0,
        },
        last30Days: {
          sales:         month30Sales,
          revenue:       rev30,
          revenueGrowth,
        },
        alerts: {
          pendingPurchases,
          lowStockCount,
          activeBookings,
          pendingExpenses,
        },
        staffCount,
      };
    }, { prefix: CachePrefix.DASHBOARD, ttl: 300 });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. LOW STOCK REPORT (for alerts)
  // ─────────────────────────────────────────────────────────────────────────────
  async getLowStockProducts(tenantId: string): Promise<Array<{ name: string; sku: string; currentStock: number; minStockLevel: number; warehouseName: string }>> {
    const results = await StockLevel.aggregate([
      { $match: { tenantId, $expr: { $lte: ['$quantity', '$minStockLevel'] } } },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $match: { 'product.isActive': true } },
      { $lookup: { from: 'warehouses', localField: 'warehouseId', foreignField: '_id', as: 'warehouse' } },
      { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } },
      { $project: {
        name:          '$product.name',
        sku:           '$product.sku',
        currentStock:  '$quantity',
        minStockLevel: 1,
        warehouseName: '$warehouse.name',
      }},
      { $sort: { currentStock: 1 } },
    ]);
    return results;
  }
}

export const reportService = new ReportService();
