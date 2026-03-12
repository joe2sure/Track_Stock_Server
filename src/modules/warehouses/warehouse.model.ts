import mongoose, { Schema, Document, Types } from "mongoose";

export interface IWarehouse extends Document {
  _id: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  address?: string;
  city: string;
  state: string;
  country: string;
  phone?: string;
  email?: string;
  managerId?: Types.ObjectId;
  capacity: number;
  usedCapacity: number;
  isActive: boolean;
  isDefault: boolean;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouse>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    description: { type: String, maxlength: 500 },
    address: { type: String, maxlength: 300 },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, default: "Nigeria", trim: true },
    phone: { type: String },
    email: { type: String, lowercase: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    capacity: { type: Number, default: 0, min: 0 },
    usedCapacity: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false },
    tenantId: { type: String, required: true, default: "default", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

warehouseSchema.virtual("capacityPercent").get(function (
  this: IWarehouse,
): number {
  if (!this.capacity) return 0;
  return parseFloat(((this.usedCapacity / this.capacity) * 100).toFixed(1));
});
warehouseSchema.virtual("freeCapacity").get(function (
  this: IWarehouse,
): number {
  return Math.max(0, this.capacity - this.usedCapacity);
});

warehouseSchema.index({ code: 1, tenantId: 1 }, { unique: true });
warehouseSchema.index({ isDefault: 1, tenantId: 1 });
warehouseSchema.index({ name: "text", code: "text", city: "text" });

const Warehouse = mongoose.model<IWarehouse>("Warehouse", warehouseSchema);
export default Warehouse;
