import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISupplier extends Document {
  _id: Types.ObjectId;
  name: string;
  supplierNumber: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  taxId?: string; // CAC / TIN number
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  paymentTerms: number; // Days (e.g. Net 30)
  creditLimit: number;
  creditBalance: number; // Outstanding balance owed to supplier
  discountPercent: number; // Default discount this supplier gives
  leadTimeDays: number; // Typical delivery lead time
  rating: number; // 1-5 supplier rating
  isActive: boolean;
  notes?: string;
  tenantId: string;
  // Aggregated stats
  totalOrders: number;
  totalPurchased: number;
  lastOrderAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    supplierNumber: { type: String, required: true, index: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String },
    email: { type: String, lowercase: true, trim: true },
    website: { type: String },
    address: { type: String, maxlength: 300 },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: "Nigeria" },
    taxId: { type: String, trim: true },
    bankName: { type: String },
    bankAccountNumber: { type: String },
    bankAccountName: { type: String },
    paymentTerms: { type: Number, default: 30, min: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    creditBalance: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    leadTimeDays: { type: Number, default: 1, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, maxlength: 1000 },
    tenantId: { type: String, required: true, default: "default", index: true },
    totalOrders: { type: Number, default: 0 },
    totalPurchased: { type: Number, default: 0 },
    lastOrderAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

supplierSchema.virtual("availableCredit").get(function (this: ISupplier) {
  return Math.max(0, this.creditLimit - this.creditBalance);
});

supplierSchema.index({ supplierNumber: 1, tenantId: 1 }, { unique: true });
supplierSchema.index({ phone: 1, tenantId: 1 }, { sparse: true });
supplierSchema.index({ name: "text", contactPerson: "text", email: "text" });

const Supplier = mongoose.model<ISupplier>("Supplier", supplierSchema);
export default Supplier;
