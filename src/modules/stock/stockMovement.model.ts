import mongoose, { Schema, Document, Types } from "mongoose";

export type MovementType =
  | "purchase_receipt"
  | "sale"
  | "sale_return"
  | "transfer_out"
  | "transfer_in"
  | "adjustment_add"
  | "adjustment_remove"
  | "damage"
  | "expiry"
  | "initial_stock"
  | "recount"
  | "production_use"
  | "production_output";

export interface IStockMovement extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  warehouseId: Types.ObjectId;
  destinationWarehouseId?: Types.ObjectId;
  type: MovementType;
  quantity: number;
  direction: "in" | "out";
  quantityBefore: number;
  quantityAfter: number;
  costPrice: number;
  totalCost: number;
  referenceType?: "sale" | "purchase" | "transfer" | "adjustment" | "return";
  referenceId?: Types.ObjectId;
  referenceNumber?: string;
  notes?: string;
  batchNumber?: string;
  expiryDate?: Date;
  performedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  tenantId: string;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantId: { type: Schema.Types.ObjectId, default: null },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    destinationWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
    type: {
      type: String,
      enum: [
        "purchase_receipt",
        "sale",
        "sale_return",
        "transfer_out",
        "transfer_in",
        "adjustment_add",
        "adjustment_remove",
        "damage",
        "expiry",
        "initial_stock",
        "recount",
        "production_use",
        "production_output",
      ],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: ["in", "out"], required: true },
    quantityBefore: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    costPrice: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    referenceType: {
      type: String,
      enum: ["sale", "purchase", "transfer", "adjustment", "return"],
    },
    referenceId: { type: Schema.Types.ObjectId, index: true, sparse: true },
    referenceNumber: { type: String, index: true, sparse: true },
    notes: { type: String, maxlength: 500 },
    batchNumber: { type: String },
    expiryDate: { type: Date },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    tenantId: { type: String, required: true, default: "default", index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
  },
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ warehouseId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, tenantId: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1, tenantId: 1 });

const StockMovement = mongoose.model<IStockMovement>(
  "StockMovement",
  stockMovementSchema,
);
export default StockMovement;
