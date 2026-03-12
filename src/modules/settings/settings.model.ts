import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBusinessInfo {
  name: string;
  tagline?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  website?: string;
  logoUrl?: string;
  taxId?: string;             // CAC / TIN
  rcNumber?: string;          // Registration number
}

export interface ITaxConfig {
  enabled: boolean;
  defaultRate: number;        // % e.g. 7.5 for VAT
  taxName: string;            // "VAT", "GST"
  taxNumber?: string;         // FIRS TIN
  inclusive: boolean;         // Tax-inclusive pricing
}

export interface IReceiptConfig {
  showLogo: boolean;
  showTaxBreakdown: boolean;
  showBarcode: boolean;
  footerText?: string;
  headerText?: string;
  copies: number;
  paperSize: 'thermal_80mm' | 'thermal_58mm' | 'a4';
}

export interface IInvoiceConfig {
  prefix: string;             // e.g. "INV"
  nextNumber: number;
  dueDays: number;            // Default payment term in days
  notes?: string;
  bankDetails?: string;       // Bank info shown on invoice
  showPaymentQR: boolean;
}

export interface IPOSConfig {
  requireCustomer: boolean;
  allowNegativeStock: boolean;
  defaultWarehouseId?: string;
  defaultTaxRate: number;
  cashDrawerEnabled: boolean;
  barcodeScanner: boolean;
  touchMode: boolean;
}

export interface INotificationConfig {
  lowStockAlerts: boolean;
  lowStockThreshold: number;   // Global fallback threshold
  emailAlerts: boolean;
  smsAlerts: boolean;
  orderConfirmation: boolean;
  dailySummaryEmail: boolean;
  dailySummaryTime: string;    // "08:00"
}

export interface IHotelConfig {
  checkInTime: string;         // "14:00"
  checkOutTime: string;        // "11:00"
  lateCheckOutFee: number;
  earlyCheckInFee: number;
  taxRate: number;
  cityLedgerEnabled: boolean;
  defaultPaymentTerms: number; // For city ledger accounts
}

export interface ISettings extends Document {
  _id: Types.ObjectId;
  tenantId: string;
  businessInfo: IBusinessInfo;
  baseCurrency: string;
  tax: ITaxConfig;
  receipt: IReceiptConfig;
  invoice: IInvoiceConfig;
  pos: IPOSConfig;
  notifications: INotificationConfig;
  hotel: IHotelConfig;
  timezone: string;
  dateFormat: string;          // "DD/MM/YYYY"
  timeFormat: '12h' | '24h';
  fiscalYearStart: number;     // Month number 1-12
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },

    businessInfo: {
      name:     { type: String, default: 'My Business' },
      tagline:  { type: String },
      email:    { type: String },
      phone:    { type: String },
      address:  { type: String },
      city:     { type: String },
      state:    { type: String },
      country:  { type: String, default: 'Nigeria' },
      website:  { type: String },
      logoUrl:  { type: String },
      taxId:    { type: String },
      rcNumber: { type: String },
    },

    baseCurrency: { type: String, default: 'NGN', uppercase: true },

    tax: {
      enabled:     { type: Boolean, default: false },
      defaultRate: { type: Number, default: 7.5, min: 0, max: 100 },
      taxName:     { type: String, default: 'VAT' },
      taxNumber:   { type: String },
      inclusive:   { type: Boolean, default: false },
    },

    receipt: {
      showLogo:         { type: Boolean, default: true },
      showTaxBreakdown: { type: Boolean, default: true },
      showBarcode:      { type: Boolean, default: false },
      footerText:       { type: String, maxlength: 300 },
      headerText:       { type: String, maxlength: 300 },
      copies:           { type: Number, default: 1, min: 1, max: 3 },
      paperSize:        { type: String, enum: ['thermal_80mm','thermal_58mm','a4'], default: 'thermal_80mm' },
    },

    invoice: {
      prefix:        { type: String, default: 'INV' },
      nextNumber:    { type: Number, default: 1001 },
      dueDays:       { type: Number, default: 30, min: 0 },
      notes:         { type: String, maxlength: 500 },
      bankDetails:   { type: String, maxlength: 500 },
      showPaymentQR: { type: Boolean, default: false },
    },

    pos: {
      requireCustomer:     { type: Boolean, default: false },
      allowNegativeStock:  { type: Boolean, default: false },
      defaultWarehouseId:  { type: String },
      defaultTaxRate:      { type: Number, default: 0 },
      cashDrawerEnabled:   { type: Boolean, default: true },
      barcodeScanner:      { type: Boolean, default: true },
      touchMode:           { type: Boolean, default: false },
    },

    notifications: {
      lowStockAlerts:     { type: Boolean, default: true },
      lowStockThreshold:  { type: Number, default: 10 },
      emailAlerts:        { type: Boolean, default: true },
      smsAlerts:          { type: Boolean, default: false },
      orderConfirmation:  { type: Boolean, default: true },
      dailySummaryEmail:  { type: Boolean, default: false },
      dailySummaryTime:   { type: String, default: '08:00' },
    },

    hotel: {
      checkInTime:         { type: String, default: '14:00' },
      checkOutTime:        { type: String, default: '11:00' },
      lateCheckOutFee:     { type: Number, default: 0 },
      earlyCheckInFee:     { type: Number, default: 0 },
      taxRate:             { type: Number, default: 7.5 },
      cityLedgerEnabled:   { type: Boolean, default: false },
      defaultPaymentTerms: { type: Number, default: 30 },
    },

    timezone:        { type: String, default: 'Africa/Lagos' },
    dateFormat:      { type: String, default: 'DD/MM/YYYY' },
    timeFormat:      { type: String, enum: ['12h','24h'], default: '12h' },
    fiscalYearStart: { type: Number, default: 1, min: 1, max: 12 },
    updatedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
export default Settings;
