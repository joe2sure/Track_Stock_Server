import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  customerNumber: string;
  type: "retail" | "wholesale" | "credit";
  creditLimit: number;
  creditBalance: number; // outstanding credit owed by customer
  loyaltyPoints: number;
  discountPercent: number; // standing discount for this customer
  notes?: string;
  isActive: boolean;
  tenantId: string;
  // Aggregated stats (updated on each sale)
  totalPurchases: number;
  totalSpent: number;
  lastPurchaseAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, maxlength: 300 },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: "Nigeria" },
    customerNumber: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["retail", "wholesale", "credit"],
      default: "retail",
      index: true,
    },
    creditLimit: { type: Number, default: 0, min: 0 },
    creditBalance: { type: Number, default: 0, min: 0 },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    notes: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    tenantId: { type: String, required: true, default: "default", index: true },
    totalPurchases: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    lastPurchaseAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

customerSchema.virtual("availableCredit").get(function (this: ICustomer) {
  return Math.max(0, this.creditLimit - this.creditBalance);
});

customerSchema.index({ customerNumber: 1, tenantId: 1 }, { unique: true });
customerSchema.index({ phone: 1, tenantId: 1 }, { sparse: true });
customerSchema.index({ email: 1, tenantId: 1 }, { sparse: true });
customerSchema.index({ name: "text", phone: "text", email: "text" });

const Customer = mongoose.model<ICustomer>("Customer", customerSchema);
export default Customer;
