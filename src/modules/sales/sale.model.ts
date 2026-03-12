import mongoose, { Schema, Document, Types } from "mongoose";

// ── Sub-document interfaces ──────────────────────────────────────────────────
export interface ISaleItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string; // snapshot
  sku: string; // snapshot
  quantity: number;
  unitPrice: number; // selling price at time of sale
  costPrice: number; // for margin calculation
  discountAmount: number; // item-level discount
  discountPercent: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number; // qty × unitPrice
  total: number; // subtotal - discount + tax
  notes?: string;
  returnedQuantity: number;
}

export interface ISalePayment {
  _id?: Types.ObjectId;
  method:
    | "cash"
    | "card"
    | "transfer"
    | "pos_terminal"
    | "wallet"
    | "credit"
    | "split";
  amount: number;
  reference?: string; // For card/transfer references
  provider?: string; // e.g. Paystack, GTBank
  status: "pending" | "completed" | "failed" | "refunded";
  paidAt?: Date;
  notes?: string;
}

export interface ISale extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  type: "pos" | "invoice" | "quotation" | "credit_sale";
  status:
    | "draft"
    | "pending"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "refunded"
    | "partial_refund";

  // Customer
  customerId?: Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;

  // Items
  items: ISaleItem[];

  // Totals
  subtotal: number;
  discountType: "none" | "percent" | "fixed";
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  roundingAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  changeGiven: number;

  // Payments
  payments: ISalePayment[];
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" | "refunded";

  // References
  warehouseId: Types.ObjectId;
  cashRegisterId?: string;
  shiftId?: string;
  invoiceNumber?: string;
  purchaseOrderNumber?: string; // Customer's PO ref

  // Return tracking
  isReturn: boolean;
  originalSaleId?: Types.ObjectId;
  returnReason?: string;

  // Dates
  saleDate: Date;
  dueDate?: Date;
  confirmedAt?: Date;
  completedAt?: Date;

  // Notes & metadata
  notes?: string;
  internalNotes?: string;
  tags?: string[];
  currency: string;
  exchangeRate: number;

  // Staff
  servedBy: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ──────────────────────────────────────────────────────────────
const saleItemSchema = new Schema<ISaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxRate: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: { type: String, maxlength: 300 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const salePaymentSchema = new Schema<ISalePayment>(
  {
    method: {
      type: String,
      enum: [
        "cash",
        "card",
        "transfer",
        "pos_terminal",
        "wallet",
        "credit",
        "split",
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String },
    provider: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    paidAt: { type: Date, default: Date.now },
    notes: { type: String, maxlength: 200 },
  },
  { _id: true },
);

// ── Main schema ──────────────────────────────────────────────────────────────
const saleSchema = new Schema<ISale>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ["pos", "invoice", "quotation", "credit_sale"],
      default: "pos",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "refunded",
        "partial_refund",
      ],
      default: "completed",
      index: true,
    },

    // Customer fields
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", index: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String },
    customerEmail: { type: String, lowercase: true },

    // Items
    items: { type: [saleItemSchema], default: [] },

    // Totals
    subtotal: { type: Number, default: 0, min: 0 },
    discountType: {
      type: String,
      enum: ["none", "percent", "fixed"],
      default: "none",
    },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    roundingAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountDue: { type: Number, default: 0 },
    changeGiven: { type: Number, default: 0, min: 0 },

    // Payments
    payments: { type: [salePaymentSchema], default: [] },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "overpaid", "refunded"],
      default: "unpaid",
      index: true,
    },

    // References
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    cashRegisterId: { type: String },
    shiftId: { type: String },
    invoiceNumber: { type: String, sparse: true },
    purchaseOrderNumber: { type: String },

    // Return
    isReturn: { type: Boolean, default: false, index: true },
    originalSaleId: { type: Schema.Types.ObjectId, ref: "Sale", sparse: true },
    returnReason: { type: String, maxlength: 500 },

    // Dates
    saleDate: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date },
    confirmedAt: { type: Date },
    completedAt: { type: Date },

    // Meta
    notes: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 1000 },
    tags: [{ type: String, lowercase: true }],
    currency: { type: String, default: "NGN", uppercase: true },
    exchangeRate: { type: Number, default: 1 },

    // Staff
    servedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },

    tenantId: { type: String, required: true, default: "default", index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────
saleSchema.virtual("itemCount").get(function (this: ISale) {
  return this.items.reduce((s, i) => s + i.quantity, 0);
});

saleSchema.virtual("grossProfit").get(function (this: ISale) {
  return this.items.reduce(
    (s, i) => s + (i.unitPrice - i.costPrice) * i.quantity,
    0,
  );
});

saleSchema.virtual("profitMargin").get(function (this: ISale) {
  if (!this.total) return 0;
  const gp = this.items.reduce(
    (s, i) => s + (i.unitPrice - i.costPrice) * i.quantity,
    0,
  );
  return parseFloat(((gp / this.total) * 100).toFixed(2));
});

// ── Indexes ───────────────────────────────────────────────────────────────────
saleSchema.index({ saleDate: -1, tenantId: 1 });
saleSchema.index({ customerId: 1, tenantId: 1 });
saleSchema.index({ warehouseId: 1, saleDate: -1 });
saleSchema.index({ status: 1, paymentStatus: 1, tenantId: 1 });
saleSchema.index({ servedBy: 1, saleDate: -1 });
saleSchema.index({ "items.productId": 1 });
saleSchema.index({ createdAt: -1 });

const Sale = mongoose.model<ISale>("Sale", saleSchema);
export default Sale;
