import mongoose, { Schema, Document, Types } from 'mongoose';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'on_leave' | 'holiday' | 'off_day';
export type LeaveType        = 'annual' | 'sick' | 'maternity' | 'paternity' | 'compassionate' | 'unpaid' | 'study';
export type LeaveStatus      = 'pending' | 'approved' | 'rejected' | 'cancelled';

// ── Attendance record ────────────────────────────────────────────────────────
export interface IAttendance extends Document {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  clockIn?: Date;
  clockOut?: Date;
  hoursWorked?: number;          // Computed
  overtimeHours: number;
  notes?: string;
  approvedBy?: Types.ObjectId;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    staffId:       { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    date:          { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['present','absent','late','half_day','on_leave','holiday','off_day'],
      required: true,
    },
    clockIn:       { type: Date },
    clockOut:      { type: Date },
    hoursWorked:   { type: Number, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    notes:         { type: String, maxlength: 300 },
    approvedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    tenantId:      { type: String, required: true, default: 'default', index: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ staffId: 1, date: 1, tenantId: 1 }, { unique: true });
attendanceSchema.index({ date: -1, tenantId: 1 });

const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);
export default Attendance;

// ── Leave request ────────────────────────────────────────────────────────────
export interface ILeaveRequest extends Document {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  leaveType: LeaveType;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  notes?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    staffId:     { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    leaveType: {
      type: String,
      enum: ['annual','sick','maternity','paternity','compassionate','unpaid','study'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending','approved','rejected','cancelled'],
      default: 'pending',
      index: true,
    },
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    days:        { type: Number, required: true, min: 1 },
    reason:      { type: String, required: true, maxlength: 1000 },
    notes:       { type: String, maxlength: 500 },
    reviewedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  { type: Date },
    reviewNotes: { type: String, maxlength: 500 },
    tenantId:    { type: String, required: true, default: 'default', index: true },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ staffId: 1, startDate: -1 });

const LeaveRequest = mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);
export default LeaveRequest;
