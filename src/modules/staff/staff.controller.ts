import { Request, Response, NextFunction } from 'express';
import { staffService } from './staff.service';
import respond from '../../shared/utils/response';

export async function getStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await staffService.getStaff(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Staff retrieved');
  } catch (e) { next(e); }
}

export async function getStaffById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await staffService.getStaffById(req.params.id as string, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Staff member retrieved', data: { staff } });
  } catch (e) { next(e); }
}

export async function getStaffStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await staffService.getStaffStats(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Staff stats', data: { stats } });
  } catch (e) { next(e); }
}

export async function getDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const departments = await staffService.getDepartments(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Departments', data: { departments } });
  } catch (e) { next(e); }
}

export async function createStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await staffService.createStaff(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Staff member created', data: { staff } });
  } catch (e) { next(e); }
}

export async function updateStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await staffService.updateStaff(req.params.id as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Staff member updated', data: { staff } });
  } catch (e) { next(e); }
}

export async function terminateStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await staffService.terminateStaff(req.params.id as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Staff member terminated', data: { staff } });
  } catch (e) { next(e); }
}

// ── Attendance ────────────────────────────────────────────────────────────────
export async function getAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await staffService.getAttendance(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Attendance records retrieved');
  } catch (e) { next(e); }
}

export async function clockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rec = await staffService.clockIn(req.params.staffId as string, req.body, req.user?.tenantId ?? 'default');
    respond.created(res, { message: 'Clocked in successfully', data: { attendance: rec } });
  } catch (e) { next(e); }
}

export async function clockOut(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rec = await staffService.clockOut(req.params.staffId as string, req.params.attendanceId as string, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Clocked out successfully', data: { attendance: rec } });
  } catch (e) { next(e); }
}

export async function bulkMarkAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await staffService.bulkMarkAttendance(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: `${result.upserted} attendance records updated`, data: result });
  } catch (e) { next(e); }
}

export async function getPayrollSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { month, year, department } = req.query as Record<string, string>;
    const summary = await staffService.getPayrollSummary(
      { month: parseInt(month, 10), year: parseInt(year, 10), department },
      req.user?.tenantId ?? 'default'
    );
    respond.success(res, { message: 'Payroll summary', data: { summary } });
  } catch (e) { next(e); }
}

// ── Leave ─────────────────────────────────────────────────────────────────────
export async function getLeaveRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await staffService.getLeaveRequests(req.query as Record<string, string>, req.user?.tenantId ?? 'default');
    respond.paginated(res, r.data, r.pagination, 'Leave requests retrieved');
  } catch (e) { next(e); }
}

export async function applyForLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const req2 = await staffService.applyForLeave(req.params.staffId as string, req.body, req.user?.tenantId ?? 'default');
    respond.created(res, { message: 'Leave request submitted', data: { leaveRequest: req2 } });
  } catch (e) { next(e); }
}

export async function reviewLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { action, reviewNotes } = req.body;
    const leaveRequest = await staffService.reviewLeave(req.params.id as string, action, reviewNotes, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: `Leave request ${action}d`, data: { leaveRequest } });
  } catch (e) { next(e); }
}
