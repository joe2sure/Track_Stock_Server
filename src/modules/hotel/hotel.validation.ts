import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

// ── Room Types ────────────────────────────────────────────────────────────────
export const createRoomTypeSchema = Joi.object({
  name:         Joi.string().trim().min(1).max(100).required(),
  code:         Joi.string().trim().min(1).max(10).uppercase().required(),
  description:  Joi.string().max(1000).optional(),
  basePrice:    Joi.number().min(0).required(),
  weekendPrice: Joi.number().min(0).optional(),
  maxOccupancy: Joi.number().integer().min(1).default(2),
  bedType:      Joi.string().valid('single','double','twin','queen','king','bunk').default('double'),
  amenities:    Joi.array().items(Joi.string().max(50)).default([]),
  sortOrder:    Joi.number().integer().min(0).default(0),
});

// ── Rooms ─────────────────────────────────────────────────────────────────────
export const createRoomSchema = Joi.object({
  roomNumber:    Joi.string().trim().min(1).max(20).required(),
  floor:         Joi.number().integer().min(0).required(),
  building:      Joi.string().max(50).optional(),
  roomTypeId:    joiSchemas.mongoId.required(),
  priceOverride: Joi.number().min(0).optional(),
  notes:         Joi.string().max(500).optional(),
});

export const updateRoomStatusSchema = Joi.object({
  status:          Joi.string().valid('available','cleaning','maintenance','out_of_order','blocked').required(),
  maintenanceNote: Joi.string().max(500).optional(),
  notes:           Joi.string().max(500).optional(),
});

// ── Bookings ──────────────────────────────────────────────────────────────────
const guestSchema = Joi.object({
  name:        Joi.string().trim().min(1).max(150).required(),
  phone:       joiSchemas.phone.optional(),
  email:       joiSchemas.email.optional(),
  idType:      Joi.string().valid('passport','national_id','drivers_license','other').optional(),
  idNumber:    Joi.string().max(50).optional(),
  nationality: Joi.string().max(50).optional(),
  isMainGuest: Joi.boolean().default(false),
});

export const createBookingSchema = Joi.object({
  roomId:          joiSchemas.mongoId.required(),
  checkInDate:     Joi.date().iso().required(),
  checkOutDate:    Joi.date().iso().greater(Joi.ref('checkInDate')).required(),
  guests:          Joi.array().items(guestSchema).min(1).required(),
  customerId:      joiSchemas.mongoId.optional(),
  adults:          Joi.number().integer().min(1).default(1),
  children:        Joi.number().integer().min(0).default(0),
  source:          Joi.string().valid('walk_in','phone','website','booking_com','airbnb','expedia','travel_agent','corporate','other').default('walk_in'),
  ratePerNight:    Joi.number().min(0).optional(),     // defaults to room type price
  discountAmount:  Joi.number().min(0).default(0),
  taxRate:         Joi.number().min(0).max(100).default(0),
  specialRequests: Joi.string().max(1000).optional(),
  notes:           Joi.string().max(1000).optional(),
  companyName:     Joi.string().max(150).optional(),
  corporateRate:   Joi.number().min(0).optional(),
  groupCode:       Joi.string().max(50).optional(),
});

export const checkInSchema = Joi.object({
  actualCheckIn:  Joi.date().iso().optional(),
  notes:          Joi.string().max(500).optional(),
  initialPayment: Joi.object({
    method:    Joi.string().valid('cash','card','transfer','credit','city_ledger','complimentary').required(),
    amount:    Joi.number().positive().required(),
    reference: Joi.string().max(200).optional(),
  }).optional(),
});

export const checkOutSchema = Joi.object({
  actualCheckOut: Joi.date().iso().optional(),
  finalPayment:   Joi.object({
    method:    Joi.string().valid('cash','card','transfer','credit','city_ledger','complimentary').required(),
    amount:    Joi.number().positive().required(),
    reference: Joi.string().max(200).optional(),
  }).optional(),
  notes: Joi.string().max(500).optional(),
});

export const folioChargeSchema = Joi.object({
  type:        Joi.string().valid('room_charge','food_beverage','laundry','minibar','transport','telephone','service','discount','tax','other').required(),
  description: Joi.string().min(1).max(300).required(),
  quantity:    Joi.number().positive().default(1),
  unitPrice:   Joi.number().required(),
  date:        Joi.date().iso().optional(),
});

export const folioPaymentSchema = Joi.object({
  method:    Joi.string().valid('cash','card','transfer','credit','city_ledger','complimentary').required(),
  amount:    Joi.number().positive().required(),
  reference: Joi.string().max(200).optional(),
  paidAt:    Joi.date().iso().optional(),
  notes:     Joi.string().max(200).optional(),
});

export const cancelBookingSchema = Joi.object({
  reason:             Joi.string().min(3).max(500).required(),
  cancellationCharge: Joi.number().min(0).default(0),
});

export const extendStaySchema = Joi.object({
  newCheckOutDate: Joi.date().iso().required(),
  newRatePerNight: Joi.number().min(0).optional(),
  notes:           Joi.string().max(500).optional(),
});

// ── Housekeeping ──────────────────────────────────────────────────────────────
export const createHKTaskSchema = Joi.object({
  roomId:        joiSchemas.mongoId.required(),
  taskType:      Joi.string().valid('checkout_clean','stayover_clean','deep_clean','turndown','inspection','maintenance_prep').required(),
  priority:      Joi.string().valid('low','normal','high','urgent').default('normal'),
  assignedTo:    joiSchemas.mongoId.optional(),
  scheduledDate: Joi.date().iso().required(),
  notes:         Joi.string().max(500).optional(),
  bookingId:     joiSchemas.mongoId.optional(),
});

export const updateHKTaskSchema = Joi.object({
  status:              Joi.string().valid('pending','in_progress','completed','skipped','issue_reported').required(),
  notes:               Joi.string().max(500).optional(),
  issueDescription:    Joi.string().max(500).optional(),
  checklistCompleted:  Joi.array().items(Joi.string()).optional(),
});

export const assignHKTaskSchema = Joi.object({
  assignedTo: joiSchemas.mongoId.required(),
});
