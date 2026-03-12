import mongoose, { Schema, Document, Types } from 'mongoose';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern' | 'casual';
export type StaffStatus    = 'active' | 'on_leave' | 'suspended' | 'terminated' | 'probation';

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface IStaff extends Document {
  _id: Types.ObjectId;
  staffNumber: string;
  userId?: Types.ObjectId;       // Link to auth user (optional — some staff may not log in)
  firstName: string;
  lastName: string;
  fullName: string;              // Virtual
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  city?: string;
  state?: string;
  country: string;
  nationality?: string;
  idType?: 'national_id' | 'passport' | 'drivers_license' | 'voters_card';
  idNumber?: string;

  // Employment
  department: string;
  jobTitle: string;
  employmentType: EmploymentType;
  status: StaffStatus;
  hireDate: Date;
  terminationDate?: Date;
  terminationReason?: string;
  probationEndDate?: Date;
  managerId?: Types.ObjectId;    // Reports to
  warehouseId?: Types.ObjectId;  // Primary location

  // Payroll
  basicSalary: number;
  currency: string;
  payFrequency: 'weekly' | 'bi_weekly' | 'monthly';
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  pensionId?: string;            // PFA / PENCOM number
  taxId?: string;                // TIN

  // Leave balance
  annualLeaveBalance: number;
  sickLeaveBalance: number;
  leavesTaken: number;

  emergencyContact?: IEmergencyContact;
  notes?: string;
  profileImage?: string;
  documents: Array<{ name: string; url: string; uploadedAt: Date }>;

  isActive: boolean;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const staffSchema = new Schema<IStaff>(
  {
    staffNumber:     { type: String, required: true, index: true },
    userId:          { type: Schema.Types.ObjectId, ref: 'User', sparse: true },
    firstName:       { type: String, required: true, trim: true, maxlength: 80 },
    lastName:        { type: String, required: true, trim: true, maxlength: 80 },
    email:           { type: String, lowercase: true, trim: true },
    phone:           { type: String },
    dateOfBirth:     { type: Date },
    gender:          { type: String, enum: ['male','female','other'] },
    address:         { type: String, maxlength: 300 },
    city:            { type: String },
    state:           { type: String },
    country:         { type: String, default: 'Nigeria' },
    nationality:     { type: String },
    idType:          { type: String, enum: ['national_id','passport','drivers_license','voters_card'] },
    idNumber:        { type: String },

    department:      { type: String, required: true, trim: true, maxlength: 100 },
    jobTitle:        { type: String, required: true, trim: true, maxlength: 100 },
    employmentType: {
      type: String, enum: ['full_time','part_time','contract','intern','casual'], default: 'full_time',
    },
    status: {
      type: String, enum: ['active','on_leave','suspended','terminated','probation'], default: 'active', index: true,
    },
    hireDate:          { type: Date, required: true },
    terminationDate:   { type: Date },
    terminationReason: { type: String, maxlength: 500 },
    probationEndDate:  { type: Date },
    managerId:         { type: Schema.Types.ObjectId, ref: 'Staff' },
    warehouseId:       { type: Schema.Types.ObjectId, ref: 'Warehouse' },

    basicSalary:        { type: Number, required: true, min: 0 },
    currency:           { type: String, default: 'NGN', uppercase: true },
    payFrequency: {
      type: String, enum: ['weekly','bi_weekly','monthly'], default: 'monthly',
    },
    bankName:           { type: String },
    bankAccountNumber:  { type: String },
    bankAccountName:    { type: String },
    pensionId:          { type: String },
    taxId:              { type: String },

    annualLeaveBalance: { type: Number, default: 20, min: 0 },
    sickLeaveBalance:   { type: Number, default: 10, min: 0 },
    leavesTaken:        { type: Number, default: 0, min: 0 },

    emergencyContact: {
      name:         { type: String },
      relationship: { type: String },
      phone:        { type: String },
    },
    notes:        { type: String, maxlength: 1000 },
    profileImage: { type: String },
    documents: [{
      name:       { type: String },
      url:        { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],

    isActive:  { type: Boolean, default: true, index: true },
    tenantId:  { type: String, required: true, default: 'default', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

staffSchema.virtual('fullName').get(function (this: IStaff) {
  return `${this.firstName} ${this.lastName}`;
});

staffSchema.virtual('yearsOfService').get(function (this: IStaff) {
  const end  = this.terminationDate ?? new Date();
  const diff = end.getTime() - this.hireDate.getTime();
  return parseFloat((diff / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
});

staffSchema.index({ staffNumber: 1, tenantId: 1 }, { unique: true });
staffSchema.index({ department: 1, tenantId: 1 });
staffSchema.index({ managerId: 1 });
staffSchema.index({ firstName: 'text', lastName: 'text', email: 'text', staffNumber: 'text' });

const Staff = mongoose.model<IStaff>('Staff', staffSchema);
export default Staff;
