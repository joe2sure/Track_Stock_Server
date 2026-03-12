import mongoose, { Schema, Document, Types } from "mongoose";

export type POStatus =
  | "draft"
  | "sent" // Sent to supplier
  | "acknowledged" // Supplier confirmed
  | "partial" // Partially received
  | "received" // Fully received
  | "cancelled"
  | "closed"; // Reconciled and closed

export type POPaymentStatus = "unpaid" | "partial" | "paid" | "overdue";

export interface IPOItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number; // Virtual: ordered - received
  unitCost: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  notes?: string;
}

export interface IPOPayment {
  _id?: Types.ObjectId;
  method: "cash" | "transfer" | "cheque" | "credit" | "advance";
  amount: number;
  reference?: string;
  paidAt: Date;
  notes?: string;
}

export interface IPurchaseOrder extends Document {
  _id: Types.ObjectId;
  poNumber: string;
  supplierId: Types.ObjectId;
  supplierName: string; // snapshot
  warehouseId: Types.ObjectId;
  status: POStatus;
  paymentStatus: POPaymentStatus;
  items: IPOItem[];

  // Totals
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  otherCharges: number;
  total: number;
  amountPaid: number;
  amountDue: number;

  // Payments
  payments: IPOPayment[];

  // Dates
  orderDate: Date;
  expectedDate?: Date;
  closedAt?: Date;

  // Notes
  notes?: string;
  internalNotes?: string;
  supplierReference?: string; // Supplier's invoice/ref number
  currency: string;
  exchangeRate: number;

  // Staff
  orderedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const poItemSchema = new Schema<IPOItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    orderedQuantity: { type: Number, required: true, min: 0.001 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: { type: String, maxlength: 300 },
  },
  { _id: true },
);

poItemSchema.virtual("remainingQuantity").get(function (this: IPOItem) {
  return Math.max(0, this.orderedQuantity - this.receivedQuantity);
});

const poPaymentSchema = new Schema<IPOPayment>(
  {
    method: {
      type: String,
      enum: ["cash", "transfer", "cheque", "credit", "advance"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String },
    paidAt: { type: Date, default: Date.now },
    notes: { type: String, maxlength: 200 },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    supplierName: { type: String, required: true },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "sent",
        "acknowledged",
        "partial",
        "received",
        "cancelled",
        "closed",
      ],
      default: "draft",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "overdue"],
      default: "unpaid",
      index: true,
    },
    items: { type: [poItemSchema], default: [] },

    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },

    payments: { type: [poPaymentSchema], default: [] },

    orderDate: { type: Date, default: Date.now, index: true },
    expectedDate: { type: Date },
    closedAt: { type: Date },

    notes: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 1000 },
    supplierReference: { type: String },
    currency: { type: String, default: "NGN", uppercase: true },
    exchangeRate: { type: Number, default: 1 },

    orderedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
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

purchaseOrderSchema.virtual("itemCount").get(function (this: IPurchaseOrder) {
  return this.items.length;
});

purchaseOrderSchema.virtual("totalOrderedQty").get(function (
  this: IPurchaseOrder,
) {
  return this.items.reduce((s, i) => s + i.orderedQuantity, 0);
});

purchaseOrderSchema.virtual("totalReceivedQty").get(function (
  this: IPurchaseOrder,
) {
  return this.items.reduce((s, i) => s + i.receivedQuantity, 0);
});

purchaseOrderSchema.index({ orderDate: -1, tenantId: 1 });
purchaseOrderSchema.index({ status: 1, paymentStatus: 1, tenantId: 1 });
purchaseOrderSchema.index({ supplierId: 1, orderDate: -1 });

const PurchaseOrder = mongoose.model<IPurchaseOrder>(
  "PurchaseOrder",
  purchaseOrderSchema,
);
export default PurchaseOrder;
