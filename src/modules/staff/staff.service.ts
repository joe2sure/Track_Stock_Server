import mongoose, { Types } from 'mongoose';
import Staff, { IStaff } from './staff.model';
// import Attendance, { IAttendance, ILeaveRequest } from './attendance.model';
// import LeaveRequest from './attendance.model';

import { Attendance, LeaveRequest, IAttendance, ILeaveRequest } from './attendance.model';
import {
  parsePagination, buildPaginationMeta, buildSearchQuery, buildDateRangeQuery,
} from '../../shared/utils/pagination';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/utils/errors';
import { PaginationQuery, PaginatedResult } from '../../shared/types';
import logger from '../../config/logger';

// ── Number generator ─────────────────────────────────────────────────────────
async function genStaffNumber(tenantId: string): Promise<string> {
  const count = await Staff.countDocuments({ tenantId });
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

async function genExpenseNumber(_tenantId: string): Promise<string> {
  return `EXP-${Date.now().toString(36).toUpperCase()}`;
}

// ── Weekday counter (excludes Sat/Sun) ───────────────────────────────────────
function countWeekdays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export class StaffService {

  // ── Staff CRUD ─────────────────────────────────────────────────────────────
  async getStaff(
    query: PaginationQuery & { department?: string; status?: string; employmentType?: string },
    tenantId: string
  ): Promise<PaginatedResult<IStaff>> {
    const { page, limit, skip, sort } = parsePagination(query, 'firstName');
    const filter: Record<string, unknown> = { tenantId };
    if (query.department)    filter.department    = query.department;
    if (query.status)        filter.status        = query.status;
    if (query.employmentType)filter.employmentType= query.employmentType;
    if (query.search) Object.assign(filter, buildSearchQuery(query.search, ['firstName','lastName','email','staffNumber','department','jobTitle']));

    const [data, total] = await Promise.all([
      Staff.find(filter)
        .populate('managerId', 'firstName lastName staffNumber')
        .populate('warehouseId', 'name code')
        .sort(sort).skip(skip).limit(limit).lean(),
      Staff.countDocuments(filter),
    ]);
    return { data: data as IStaff[], pagination: buildPaginationMeta(total, page, limit) };
  }

  async getStaffById(id: string, tenantId: string): Promise<IStaff> {
    const s = await Staff.findOne({ _id: id, tenantId })
      .populate('managerId', 'firstName lastName staffNumber jobTitle')
      .populate('warehouseId', 'name code')
      .populate('userId', 'name email role');
    if (!s) throw new NotFoundError('Staff member');
    return s;
  }

  async createStaff(input: Partial<IStaff>, tenantId: string, userId: string): Promise<IStaff> {
    if (input.email) {
      const exists = await Staff.findOne({ email: input.email, tenantId });
      if (exists) throw new ConflictError(`Staff with email "${input.email}" already exists`);
    }
    const staffNumber = await genStaffNumber(tenantId);
    return Staff.create({ ...input, staffNumber, tenantId, createdBy: userId });
  }

  async updateStaff(id: string, input: Partial<IStaff>, tenantId: string): Promise<IStaff> {
    const s = await Staff.findOneAndUpdate(
      { _id: id, tenantId }, input, { new: true, runValidators: true }
    );
    if (!s) throw new NotFoundError('Staff member');
    return s;
  }

  async terminateStaff(
    id: string,
    input: { terminationDate: Date; terminationReason: string },
    tenantId: string
  ): Promise<IStaff> {
    const s = await Staff.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status:            'terminated',
        terminationDate:   input.terminationDate,
        terminationReason: input.terminationReason,
        isActive:          false,
      },
      { new: true }
    );
    if (!s) throw new NotFoundError('Staff member');
    logger.info(`Staff terminated: ${s.staffNumber} — ${input.terminationReason}`);
    return s;
  }

  // ── Departments ────────────────────────────────────────────────────────────
  async getDepartments(tenantId: string): Promise<string[]> {
    return Staff.distinct('department', { tenantId, isActive: true });
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  async clockIn(
    staffId: string,
    input: { clockIn?: Date; notes?: string },
    tenantId: string
  ): Promise<IAttendance> {
    const staff = await Staff.findOne({ _id: staffId, tenantId });
    if (!staff) throw new NotFoundError('Staff member');

    const today = new Date();
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Prevent duplicate clock-in for the same day
    const existing = await Attendance.findOne({ staffId, date: dateOnly, tenantId });
    if (existing?.clockIn) throw new ConflictError('Staff has already clocked in today');

    const clockTime = input.clockIn ?? new Date();
    // Considered late if clock-in is after 09:00
    const lateThreshold = new Date(dateOnly);
    lateThreshold.setHours(9, 0, 0);
    const status = clockTime > lateThreshold ? 'late' : 'present';

    if (existing) {
      return Attendance.findByIdAndUpdate(existing._id, { clockIn: clockTime, status, notes: input.notes }, { new: true }) as Promise<IAttendance>;
    }

    return Attendance.create({
      staffId, date: dateOnly, status, clockIn: clockTime, notes: input.notes, tenantId,
    });
  }

  async clockOut(
    staffId: string,
    attendanceId: string,
    input: { clockOut?: Date; overtimeHours?: number; notes?: string },
    tenantId: string
  ): Promise<IAttendance> {
    const att = await Attendance.findOne({ _id: attendanceId, staffId, tenantId });
    if (!att) throw new NotFoundError('Attendance record');
    if (!att.clockIn) throw new BadRequestError('Cannot clock out without a clock-in');
    if (att.clockOut) throw new BadRequestError('Already clocked out');

    const clockOut  = input.clockOut ?? new Date();
    const hoursWorked = parseFloat(
      ((clockOut.getTime() - att.clockIn.getTime()) / 3_600_000).toFixed(2)
    );

    return Attendance.findByIdAndUpdate(
      attendanceId,
      { clockOut, hoursWorked, overtimeHours: input.overtimeHours ?? 0, notes: input.notes },
      { new: true }
    ) as Promise<IAttendance>;
  }

  async bulkMarkAttendance(
    input: {
      date: Date;
      records: Array<{ staffId: string; status: IAttendance['status']; clockIn?: Date; clockOut?: Date; overtimeHours?: number; notes?: string }>;
    },
    tenantId: string,
    userId: string
  ): Promise<{ upserted: number }> {
    const dateOnly = new Date(input.date.getFullYear(), input.date.getMonth(), input.date.getDate());
    const ops = input.records.map(r => ({
      updateOne: {
        filter: { staffId: r.staffId, date: dateOnly, tenantId },
        update: {
          $set: {
            status:        r.status,
            clockIn:       r.clockIn,
            clockOut:      r.clockOut,
            overtimeHours: r.overtimeHours ?? 0,
            notes:         r.notes,
            approvedBy:    userId,
            hoursWorked:   (r.clockIn && r.clockOut)
              ? parseFloat(((new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3_600_000).toFixed(2))
              : undefined,
          },
        },
        upsert: true,
      },
    }));

    const result = await Attendance.bulkWrite(ops as Parameters<typeof Attendance.bulkWrite>[0]);
    return { upserted: result.upsertedCount + result.modifiedCount };
  }

  async getAttendance(
    query: PaginationQuery & { staffId?: string; from?: string; to?: string; status?: string },
    tenantId: string
  ): Promise<PaginatedResult<IAttendance>> {
    const { page, limit, skip } = parsePagination(query, 'date');
    const filter: Record<string, unknown> = { tenantId };
    if (query.staffId) filter.staffId = query.staffId;
    if (query.status)  filter.status  = query.status;
    Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'date'));

    const [data, total] = await Promise.all([
      Attendance.find(filter)
        .populate('staffId', 'firstName lastName staffNumber department')
        .sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Attendance.countDocuments(filter),
    ]);
    return { data: data as IAttendance[], pagination: buildPaginationMeta(total, page, limit) };
  }

  // ── Leave requests ─────────────────────────────────────────────────────────
  async applyForLeave(
    staffId: string,
    input: { leaveType: ILeaveRequest['leaveType']; startDate: Date; endDate: Date; reason: string; notes?: string },
    tenantId: string
  ): Promise<ILeaveRequest> {
    const staff = await Staff.findOne({ _id: staffId, tenantId });
    if (!staff) throw new NotFoundError('Staff member');

    const days = countWeekdays(new Date(input.startDate), new Date(input.endDate));

    // Check leave balance for annual / sick
    if (input.leaveType === 'annual' && days > staff.annualLeaveBalance) {
      throw new BadRequestError(`Insufficient annual leave balance. Available: ${staff.annualLeaveBalance} days, Requested: ${days} days`);
    }
    if (input.leaveType === 'sick' && days > staff.sickLeaveBalance) {
      throw new BadRequestError(`Insufficient sick leave balance. Available: ${staff.sickLeaveBalance} days, Requested: ${days} days`);
    }

    // Check for overlapping leave
    const overlap = await LeaveRequest.findOne({
      staffId,
      tenantId,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: new Date(input.endDate) },
      endDate:   { $gte: new Date(input.startDate) },
    });
    if (overlap) throw new ConflictError('You have an overlapping leave request for this period');

    return LeaveRequest.create({ ...input, staffId, days, tenantId });
  }

  async reviewLeave(
    id: string,
    action: 'approve' | 'reject',
    reviewNotes: string | undefined,
    tenantId: string,
    reviewerId: string
  ): Promise<ILeaveRequest> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const req = await LeaveRequest.findOne({ _id: id, tenantId }).session(session);
      if (!req) throw new NotFoundError('Leave request');
      if (req.status !== 'pending') throw new BadRequestError(`Cannot review a ${req.status} leave request`);

      await LeaveRequest.findByIdAndUpdate(id, {
        status:      action === 'approve' ? 'approved' : 'rejected',
        reviewedBy:  reviewerId,
        reviewedAt:  new Date(),
        reviewNotes,
      }, { session });

      // Deduct balance only on approval
      if (action === 'approve') {
        const staff = await Staff.findById(req.staffId).session(session);
        if (staff) {
          if (req.leaveType === 'annual') {
            await Staff.findByIdAndUpdate(req.staffId, {
              $inc: { annualLeaveBalance: -req.days, leavesTaken: req.days },
            }, { session });
          } else if (req.leaveType === 'sick') {
            await Staff.findByIdAndUpdate(req.staffId, {
              $inc: { sickLeaveBalance: -req.days, leavesTaken: req.days },
            }, { session });
          }
        }
      }

      await session.commitTransaction();
      return LeaveRequest.findById(id) as Promise<ILeaveRequest>;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async getLeaveRequests(
    query: PaginationQuery & { staffId?: string; status?: string; from?: string; to?: string },
    tenantId: string
  ): Promise<PaginatedResult<ILeaveRequest>> {
    const { page, limit, skip } = parsePagination(query, 'startDate');
    const filter: Record<string, unknown> = { tenantId };
    if (query.staffId) filter.staffId = query.staffId;
    if (query.status)  filter.status  = query.status;
    Object.assign(filter, buildDateRangeQuery(query.from, query.to, 'startDate'));

    const [data, total] = await Promise.all([
      LeaveRequest.find(filter)
        .populate('staffId', 'firstName lastName staffNumber department')
        .populate('reviewedBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LeaveRequest.countDocuments(filter),
    ]);
    return { data: data as ILeaveRequest[], pagination: buildPaginationMeta(total, page, limit) };
  }

  // ── Payroll summary ────────────────────────────────────────────────────────
  async getPayrollSummary(
    query: { month: number; year: number; department?: string },
    tenantId: string
  ) {
    const startDate = new Date(query.year, query.month - 1, 1);
    const endDate   = new Date(query.year, query.month, 0);   // last day of month

    const filter: Record<string, unknown> = { tenantId, isActive: true, status: { $ne: 'terminated' } };
    if (query.department) filter.department = query.department;

    const staff = await Staff.find(filter).lean();

    // Attendance stats for the month
    const attStats = await Attendance.aggregate([
      {
        $match: {
          tenantId,
          date: { $gte: startDate, $lte: endDate },
          ...(staff.length ? { staffId: { $in: staff.map(s => s._id) } } : {}),
        },
      },
      {
        $group: {
          _id:           '$staffId',
          presentDays:   { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
          absentDays:    { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          leaveDays:     { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
          overtimeHours: { $sum: '$overtimeHours' },
          totalHours:    { $sum: '$hoursWorked' },
        },
      },
    ]);

    const attMap = new Map(attStats.map(a => [a._id.toString(), a]));
    const workingDays = countWeekdays(startDate, endDate);

    const rows = staff.map(s => {
      const att         = attMap.get(s._id.toString()) ?? { presentDays: 0, absentDays: 0, leaveDays: 0, overtimeHours: 0, totalHours: 0 };
      const grossSalary = s.basicSalary;
      // Simple deduction: absent days * daily rate
      const dailyRate   = grossSalary / workingDays;
      const deductions  = parseFloat((att.absentDays * dailyRate).toFixed(2));
      const netSalary   = Math.max(0, grossSalary - deductions);
      return {
        staffId:        s._id,
        staffNumber:    s.staffNumber,
        name:           `${s.firstName} ${s.lastName}`,
        department:     s.department,
        jobTitle:       s.jobTitle,
        employmentType: s.employmentType,
        basicSalary:    grossSalary,
        presentDays:    att.presentDays,
        absentDays:     att.absentDays,
        leaveDays:      att.leaveDays,
        overtimeHours:  att.overtimeHours,
        deductions,
        netSalary,
      };
    });

    const totalGross = rows.reduce((s, r) => s + r.basicSalary, 0);
    const totalNet   = rows.reduce((s, r) => s + r.netSalary, 0);
    const totalDeductions = rows.reduce((s, r) => s + r.deductions, 0);

    return {
      period:        { month: query.month, year: query.year, startDate, endDate },
      workingDays,
      headcount:     staff.length,
      totalGross,
      totalDeductions,
      totalNet,
      rows,
    };
  }

  // ── Staff stats ────────────────────────────────────────────────────────────
  async getStaffStats(tenantId: string) {
    const [total, byStatus, byDept, byType, onLeave] = await Promise.all([
      Staff.countDocuments({ tenantId }),
      Staff.aggregate([{ $match: { tenantId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Staff.aggregate([{ $match: { tenantId, isActive: true } }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Staff.aggregate([{ $match: { tenantId, isActive: true } }, { $group: { _id: '$employmentType', count: { $sum: 1 } } }]),
      Staff.countDocuments({ tenantId, status: 'on_leave' }),
    ]);

    const totalPayroll = await Staff.aggregate([
      { $match: { tenantId, isActive: true, status: { $ne: 'terminated' } } },
      { $group: { _id: null, total: { $sum: '$basicSalary' } } },
    ]);

    return {
      total,
      active:        byStatus.find(s => s._id === 'active')?.count ?? 0,
      onLeave,
      byStatus:      Object.fromEntries(byStatus.map(s => [s._id, s.count])),
      byDepartment:  byDept,
      byEmploymentType: Object.fromEntries(byType.map(t => [t._id, t.count])),
      monthlyPayroll: totalPayroll[0]?.total ?? 0,
    };
  }
}

export const staffService = new StaffService();
