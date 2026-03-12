import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

export const createStaffSchema = Joi.object({
  firstName:       Joi.string().trim().min(1).max(80).required(),
  lastName:        Joi.string().trim().min(1).max(80).required(),
  email:           joiSchemas.email.optional(),
  phone:           joiSchemas.phone.optional(),
  dateOfBirth:     Joi.date().iso().max('now').optional(),
  gender:          Joi.string().valid('male','female','other').optional(),
  address:         Joi.string().max(300).optional(),
  city:            Joi.string().optional(),
  state:           Joi.string().optional(),
  country:         Joi.string().default('Nigeria'),
  nationality:     Joi.string().optional(),
  idType:          Joi.string().valid('national_id','passport','drivers_license','voters_card').optional(),
  idNumber:        Joi.string().max(50).optional(),

  department:      Joi.string().trim().min(1).max(100).required(),
  jobTitle:        Joi.string().trim().min(1).max(100).required(),
  employmentType:  Joi.string().valid('full_time','part_time','contract','intern','casual').default('full_time'),
  hireDate:        Joi.date().iso().required(),
  probationEndDate:Joi.date().iso().optional(),
  managerId:       joiSchemas.mongoId.optional(),
  warehouseId:     joiSchemas.mongoId.optional(),
  userId:          joiSchemas.mongoId.optional(),

  basicSalary:     Joi.number().min(0).required(),
  payFrequency:    Joi.string().valid('weekly','bi_weekly','monthly').default('monthly'),
  bankName:        Joi.string().max(100).optional(),
  bankAccountNumber: Joi.string().max(50).optional(),
  bankAccountName: Joi.string().max(150).optional(),
  pensionId:       Joi.string().max(50).optional(),
  taxId:           Joi.string().max(50).optional(),

  annualLeaveBalance: Joi.number().min(0).default(20),
  sickLeaveBalance:   Joi.number().min(0).default(10),

  emergencyContact: Joi.object({
    name:         Joi.string().required(),
    relationship: Joi.string().required(),
    phone:        joiSchemas.phone.required(),
  }).optional(),
  notes: Joi.string().max(1000).optional(),
});

export const clockInSchema = Joi.object({
  staffId:  joiSchemas.mongoId.required(),
  clockIn:  Joi.date().iso().optional(),
  notes:    Joi.string().max(300).optional(),
});

export const clockOutSchema = Joi.object({
  clockOut:      Joi.date().iso().optional(),
  overtimeHours: Joi.number().min(0).default(0),
  notes:         Joi.string().max(300).optional(),
});

export const leaveRequestSchema = Joi.object({
  leaveType:  Joi.string().valid('annual','sick','maternity','paternity','compassionate','unpaid','study').required(),
  startDate:  Joi.date().iso().required(),
  endDate:    Joi.date().iso().min(Joi.ref('startDate')).required(),
  reason:     Joi.string().min(5).max(1000).required(),
  notes:      Joi.string().max(500).optional(),
});

export const reviewLeaveSchema = Joi.object({
  action:      Joi.string().valid('approve','reject').required(),
  reviewNotes: Joi.string().max(500).optional(),
});

export const bulkAttendanceSchema = Joi.object({
  date: Joi.date().iso().required(),
  records: Joi.array().items(Joi.object({
    staffId: joiSchemas.mongoId.required(),
    status:  Joi.string().valid('present','absent','late','half_day','on_leave','holiday','off_day').required(),
    clockIn: Joi.date().iso().optional(),
    clockOut:Joi.date().iso().optional(),
    overtimeHours: Joi.number().min(0).default(0),
    notes:   Joi.string().max(300).optional(),
  })).min(1).required(),
});
