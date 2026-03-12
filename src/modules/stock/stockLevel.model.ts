import mongoose, { Schema, Document, Types } from "mongoose";

export interface IStockLevel extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  warehouseId: Types.ObjectId;
  quantity: number;
  reservedQuantity: number;
  minStockLevel: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  locationCode?: string;
  batchNumber?: string;
  expiryDate?: Date;
  costPrice: number;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockLevelSchema = new Schema<IStockLevel>(
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
    quantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    minStockLevel: { type: Number, default: 0 },
    maxStockLevel: { type: Number },
    reorderPoint: { type: Number },
    reorderQuantity: { type: Number },
    locationCode: { type: String, trim: true },
    batchNumber: { type: String, trim: true },
    expiryDate: { type: Date },
    costPrice: { type: Number, default: 0, min: 0 },
    tenantId: { type: String, required: true, default: "default", index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

stockLevelSchema.virtual("availableQuantity").get(function (
  this: IStockLevel,
): number {
  return Math.max(0, this.quantity - this.reservedQuantity);
});
stockLevelSchema.virtual("stockStatus").get(function (
  this: IStockLevel,
): string {
  const avail = this.quantity - this.reservedQuantity;
  if (avail <= 0) return "out_of_stock";
  if (avail <= this.minStockLevel) return "low_stock";
  return "in_stock";
});

stockLevelSchema.index(
  { productId: 1, variantId: 1, warehouseId: 1, tenantId: 1 },
  { unique: true },
);
stockLevelSchema.index({ quantity: 1, minStockLevel: 1, tenantId: 1 });
stockLevelSchema.index({ expiryDate: 1, tenantId: 1 }, { sparse: true });

const StockLevel = mongoose.model<IStockLevel>("StockLevel", stockLevelSchema);
export default StockLevel;
