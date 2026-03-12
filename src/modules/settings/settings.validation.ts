import Joi from 'joi';

const businessInfoSchema = Joi.object({
  name:     Joi.string().trim().min(1).max(200).optional(),
  tagline:  Joi.string().max(200).optional(),
  email:    Joi.string().email().lowercase().optional(),
  phone:    Joi.string().max(20).optional(),
  address:  Joi.string().max(300).optional(),
  city:     Joi.string().max(100).optional(),
  state:    Joi.string().max(100).optional(),
  country:  Joi.string().max(100).optional(),
  website:  Joi.string().uri().optional(),
  logoUrl:  Joi.string().uri().optional(),
  taxId:    Joi.string().max(50).optional(),
  rcNumber: Joi.string().max(50).optional(),
});

const taxSchema = Joi.object({
  enabled:     Joi.boolean().optional(),
  defaultRate: Joi.number().min(0).max(100).optional(),
  taxName:     Joi.string().max(20).optional(),
  taxNumber:   Joi.string().max(50).optional(),
  inclusive:   Joi.boolean().optional(),
});

const receiptSchema = Joi.object({
  showLogo:         Joi.boolean().optional(),
  showTaxBreakdown: Joi.boolean().optional(),
  showBarcode:      Joi.boolean().optional(),
  footerText:       Joi.string().max(300).optional(),
  headerText:       Joi.string().max(300).optional(),
  copies:           Joi.number().integer().min(1).max(3).optional(),
  paperSize:        Joi.string().valid('thermal_80mm','thermal_58mm','a4').optional(),
});

const invoiceSchema = Joi.object({
  prefix:        Joi.string().trim().max(10).optional(),
  dueDays:       Joi.number().integer().min(0).optional(),
  notes:         Joi.string().max(500).optional(),
  bankDetails:   Joi.string().max(500).optional(),
  showPaymentQR: Joi.boolean().optional(),
});

const posSchema = Joi.object({
  requireCustomer:    Joi.boolean().optional(),
  allowNegativeStock: Joi.boolean().optional(),
  defaultWarehouseId: Joi.string().optional(),
  defaultTaxRate:     Joi.number().min(0).max(100).optional(),
  cashDrawerEnabled:  Joi.boolean().optional(),
  barcodeScanner:     Joi.boolean().optional(),
  touchMode:          Joi.boolean().optional(),
});

const notificationsSchema = Joi.object({
  lowStockAlerts:    Joi.boolean().optional(),
  lowStockThreshold: Joi.number().integer().min(0).optional(),
  emailAlerts:       Joi.boolean().optional(),
  smsAlerts:         Joi.boolean().optional(),
  orderConfirmation: Joi.boolean().optional(),
  dailySummaryEmail: Joi.boolean().optional(),
  dailySummaryTime:  Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
});

const hotelSchema = Joi.object({
  checkInTime:         Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  checkOutTime:        Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  lateCheckOutFee:     Joi.number().min(0).optional(),
  earlyCheckInFee:     Joi.number().min(0).optional(),
  taxRate:             Joi.number().min(0).max(100).optional(),
  cityLedgerEnabled:   Joi.boolean().optional(),
  defaultPaymentTerms: Joi.number().integer().min(0).optional(),
});

const generalSchema = Joi.object({
  timezone:        Joi.string().max(50).optional(),
  dateFormat:      Joi.string().valid('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD').optional(),
  timeFormat:      Joi.string().valid('12h','24h').optional(),
  fiscalYearStart: Joi.number().integer().min(1).max(12).optional(),
  baseCurrency:    Joi.string().uppercase().length(3).optional(),
});

// Map section name → schema
export const SECTION_SCHEMAS: Record<string, Joi.ObjectSchema> = {
  businessInfo:  businessInfoSchema,
  tax:           taxSchema,
  receipt:       receiptSchema,
  invoice:       invoiceSchema,
  pos:           posSchema,
  notifications: notificationsSchema,
  hotel:         hotelSchema,
  general:       generalSchema,
};

export const invoiceResetSchema = Joi.object({
  nextNumber: Joi.number().integer().min(1).required(),
});

export const bootstrapSchema = Joi.object({
  businessName: Joi.string().trim().min(1).max(200).required(),
});
