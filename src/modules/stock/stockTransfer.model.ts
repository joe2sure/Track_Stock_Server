import mongoose, { Schema, Document, Types } from "mongoose";

export type TransferStatus =
  | "draft"
  | "pending"
  | "approved"
  | "in_transit"
  | "received"
  | "partial"
  | "cancelled"
  | "rejected";

export interface ITransferItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  costPrice: number;
  notes?: string;
}

export interface IStockTransfer extends Document {
  _id: Types.ObjectId;
  transferNumber: string;
  fromWarehouseId: Types.ObjectId;
  toWarehouseId: Types.ObjectId;
  items: ITransferItem[];
  status: TransferStatus;
  notes?: string;
  requestedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  dispatchedBy?: Types.ObjectId;
  dispatchedAt?: Date;
  receivedBy?: Types.ObjectId;
  receivedAt?: Date;
  expectedDate?: Date;
  rejectionReason?: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const transferItemSchema = new Schema<ITransferItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    requestedQuantity: { type: Number, required: true, min: 1 },
    dispatchedQuantity: { type: Number, default: 0, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    notes: { type: String, maxlength: 200 },
  },
  { _id: true },
);

const stockTransferSchema = new Schema<IStockTransfer>(
  {
    transferNumber: { type: String, required: true, unique: true, index: true },
    fromWarehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    toWarehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    items: { type: [transferItemSchema], default: [] },
    status: {
      type: String,
      enum: [
        "draft",
        "pending",
        "approved",
        "in_transit",
        "received",
        "partial",
        "cancelled",
        "rejected",
      ],
      default: "pending",
      index: true,
    },
    notes: { type: String, maxlength: 1000 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: "User" },
    dispatchedAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    receivedAt: { type: Date },
    expectedDate: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    tenantId: { type: String, required: true, default: "default", index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

stockTransferSchema.virtual("totalItems").get(function (this: IStockTransfer) {
  return this.items.length;
});
stockTransferSchema.virtual("totalRequestedQty").get(function (
  this: IStockTransfer,
) {
  return this.items.reduce((s, i) => s + i.requestedQuantity, 0);
});

stockTransferSchema.index({ status: 1, tenantId: 1, createdAt: -1 });
stockTransferSchema.index({ createdAt: -1, tenantId: 1 });

const StockTransfer = mongoose.model<IStockTransfer>(
  "StockTransfer",
  stockTransferSchema,
);
export default StockTransfer;
