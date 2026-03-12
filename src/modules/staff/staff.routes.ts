import { Router } from 'express';
import * as ctrl from './staff.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  createStaffSchema, clockInSchema, clockOutSchema,
  leaveRequestSchema, reviewLeaveSchema, bulkAttendanceSchema,
} from './staff.validation';
import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

const router = Router();
router.use(authenticate);

type Role = 'super_admin' | 'admin' | 'manager' | 'accountant';
const mgr:  Role[] = ['super_admin','admin','manager'];
const acct: Role[] = ['super_admin','admin','manager','accountant'];

const terminateSchema = Joi.object({
  terminationDate:   Joi.date().iso().required(),
  terminationReason: Joi.string().min(5).max(500).required(),
});

// ── Staff ─────────────────────────────────────────────────────────────────────
router.get('/stats',             authorize(...acct), ctrl.getStaffStats);
router.get('/departments',       ctrl.getDepartments);
router.get('/payroll/summary',   authorize(...acct), ctrl.getPayrollSummary);
router.get('/',                  ctrl.getStaff);
router.get('/:id',               ctrl.getStaffById);
router.post('/',                 authorize(...mgr),  validate(createStaffSchema),  ctrl.createStaff);
router.put('/:id',               authorize(...mgr),  validate(createStaffSchema.fork(['firstName','lastName','department','jobTitle','basicSalary','hireDate'], s => s.optional())), ctrl.updateStaff);
router.patch('/:id/terminate',   authorize(...mgr),  validate(terminateSchema),    ctrl.terminateStaff);

// ── Attendance ────────────────────────────────────────────────────────────────
router.get('/attendance',                                        ctrl.getAttendance);
router.post('/:staffId/clock-in',   validate(clockInSchema.fork(['staffId'], s => s.optional())),   ctrl.clockIn);
router.patch('/:staffId/clock-out/:attendanceId', validate(clockOutSchema), ctrl.clockOut);
router.post('/attendance/bulk',     authorize(...mgr), validate(bulkAttendanceSchema), ctrl.bulkMarkAttendance);

// ── Leave ─────────────────────────────────────────────────────────────────────
router.get('/leave',                             ctrl.getLeaveRequests);
router.post('/:staffId/leave',  validate(leaveRequestSchema),   ctrl.applyForLeave);
router.patch('/leave/:id/review', authorize(...mgr), validate(reviewLeaveSchema), ctrl.reviewLeave);

export default router;
