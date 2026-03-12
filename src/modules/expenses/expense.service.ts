import Expense, { IExpense } from './expense.model';
import {
  parsePagination, buildPaginationMeta, buildSearchQuery, buildDateRangeQuery,
} from '../../shared/utils/pagination';
import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import logger from '../../config/logger';

// ── Number generator ─────────────────────────────────────────────────────────
async function genExpenseNumber(tenantId: string): Promise<string> {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Expense.countDocuments({ tenantId, createdAt: { $gte: new Date(d.getFullYear(), d.getMonth(), 1) } });
  return `EXP-${ym}-${String(count + 1).padStart(4, '0')}`;
}

export class ExpenseService {

  async getExpenses(
    query: PaginationQuery & {
      status?: string; category?: string; submittedBy?: string;
      warehouseId?: string; from?: string; to?: string;
    },
    tenantId: string
  ): Promise<PaginatedResult<IExpense>> {
    const { page, limit, skip, sort } = parsePagination(query, 'expenseDate');
    const filter: Record<string, unknown> = { tenantId };
    if (query.status)      filter.status      = query.status;
    if (query.category)    filter.category    = query.category;
    if (query.submittedBy) filter.submittedBy = query.submittedBy;
    if (query.warehouseId) filter.warehouseId = query.warehouseId;
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['title','description','expenseNumber','category']));
    Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'expenseDate'));

    const [data, total] = await Promise.all([
      Expense.find(filter)
        .populate('submittedBy', 'name email')
        .populate('staffId', 'firstName lastName staffNumber')
        .populate('reviewedBy', 'name')
        .populate('warehouseId', 'name code')
        .sort({ expenseDate: -1, ...sort }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
    ]);
    return { data: data as IExpense[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getExpenseById(id: string, tenantId: string): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId })
      .populate('submittedBy', 'name email')
      .populate('staffId', 'firstName lastName staffNumber department')
      .populate('reviewedBy', 'name')
      .populate('warehouseId', 'name code');
    if (!e) throw new NotFoundError('Expense');
    return e;
  }

  async createExpense(
    input: {
      title: string; description?: string; category: string;
      amount: number; taxAmount?: number; expenseDate: Date;
      warehouseId?: string; staffId?: string;
      isBillable?: boolean; notes?: string; tags?: string[];
    },
    tenantId: string,
    userId: string
  ): Promise<IExpense> {
    const expenseNumber = await genExpenseNumber(tenantId);
    const taxAmount     = input.taxAmount ?? 0;
    return Expense.create({
      ...input,
      expenseNumber,
      taxAmount,
      totalAmount: input.amount + taxAmount,
      submittedBy: userId,
      status:      'draft',
      tenantId,
    });
  }

  async updateExpense(id: string, input: Partial<IExpense>, tenantId: string, userId: string): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId });
    if (!e) throw new NotFoundError('Expense');
    if (!['draft', 'rejected'].includes(e.status)) {
      throw new BadRequestError(`Cannot edit an expense with status "${e.status}"`);
    }
    if (e.submittedBy.toString() !== userId) {
      throw new BadRequestError('You can only edit your own expenses');
    }
    const taxAmount = input.taxAmount ?? e.taxAmount;
    const amount    = input.amount    ?? e.amount;
    return Expense.findByIdAndUpdate(id, {
      ...input, taxAmount, totalAmount: amount + taxAmount,
    }, { new: true }) as Promise<IExpense>;
  }

  async submitExpense(id: string, tenantId: string, userId: string): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId });
    if (!e) throw new NotFoundError('Expense');
    if (e.submittedBy.toString() !== userId) throw new BadRequestError('You can only submit your own expenses');
    if (!['draft', 'rejected'].includes(e.status)) throw new BadRequestError(`Cannot submit from status "${e.status}"`);

    return Expense.findByIdAndUpdate(id, { status: 'submitted' }, { new: true }) as Promise<IExpense>;
  }

  async reviewExpense(
    id: string,
    action: 'approve' | 'reject',
    reviewNotes: string | undefined,
    tenantId: string,
    reviewerId: string
  ): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId });
    if (!e) throw new NotFoundError('Expense');
    if (e.status !== 'submitted') throw new BadRequestError(`Cannot review an expense with status "${e.status}"`);

    return Expense.findByIdAndUpdate(id, {
      status:      action === 'approve' ? 'approved' : 'rejected',
      reviewedBy:  reviewerId,
      reviewedAt:  new Date(),
      reviewNotes,
    }, { new: true }) as Promise<IExpense>;
  }

  async payExpense(
    id: string,
    input: { paymentMethod: IExpense['paymentMethod']; paidAt?: Date; paymentReference?: string },
    tenantId: string
  ): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId });
    if (!e) throw new NotFoundError('Expense');
    if (e.status !== 'approved') throw new BadRequestError('Only approved expenses can be paid');

    return Expense.findByIdAndUpdate(id, {
      status:           'paid',
      paymentMethod:    input.paymentMethod,
      paidAt:           input.paidAt ?? new Date(),
      paymentReference: input.paymentReference,
    }, { new: true }) as Promise<IExpense>;
  }

  async cancelExpense(id: string, tenantId: string, userId: string): Promise<IExpense> {
    const e = await Expense.findOne({ _id: id, tenantId });
    if (!e) throw new NotFoundError('Expense');
    if (['paid', 'cancelled'].includes(e.status)) throw new BadRequestError(`Cannot cancel a ${e.status} expense`);
    return Expense.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true }) as Promise<IExpense>;
  }

  async getExpenseStats(
    query: { from?: string; to?: string; warehouseId?: string },
    tenantId: string
  ) {
    const match: Record<string, unknown> = {
      tenantId,
      status: { $nin: ['cancelled', 'rejected'] },
    };
    if (query.warehouseId) match.warehouseId = query.warehouseId;
    Object.assign(match, buildDateRangeQuery(query.from, query.to, 'expenseDate'));

    const [overview, byCategory, byStatus, byMonth, pending] = await Promise.all([
      Expense.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$totalAmount', 0] } }, pending: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'approved']] }, '$totalAmount', 0] } } } },
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      Expense.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      Expense.aggregate([
        { $match: { ...match, expenseDate: { $gte: new Date(Date.now() - 180 * 86_400_000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$expenseDate' } }, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      Expense.find({ tenantId, status: 'submitted' })
        .populate('submittedBy', 'name')
        .sort({ createdAt: 1 }).limit(10).select('expenseNumber title category totalAmount createdAt submittedBy').lean(),
    ]);

    return {
      overview:   overview[0] ?? { count: 0, totalAmount: 0, paid: 0, pending: 0 },
      byCategory,
      byStatus:   Object.fromEntries(byStatus.map(s => [s._id, { count: s.count, total: s.total }])),
      byMonth,
      pendingApproval: pending,
    };
  }

  async getCategories(tenantId: string): Promise<string[]> {
    return Expense.distinct('category', { tenantId });
  }
}

export const expenseService = new ExpenseService();
