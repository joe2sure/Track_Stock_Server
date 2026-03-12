import mongoose, { Schema, Document, Types } from "mongoose";

export type UnitType =
  | "count"
  | "weight"
  | "volume"
  | "length"
  | "area"
  | "time"
  | "digital";

export interface IUnit extends Document {
  _id: Types.ObjectId;
  name: string;
  abbreviation: string;
  type: UnitType;
  baseUnit?: string; // For conversion chains (e.g. g → kg)
  conversionFactor?: number; // e.g. 1000 (1 kg = 1000 g)
  isBase: boolean;
  isActive: boolean;
  tenantId: string;
  productCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const unitSchema = new Schema<IUnit>(
  {
    name: {
      type: String,
      required: [true, "Unit name is required"],
      trim: true,
      maxlength: [60, "Unit name must not exceed 60 characters"],
    },
    abbreviation: {
      type: String,
      required: [true, "Unit abbreviation is required"],
      trim: true,
      maxlength: [10, "Abbreviation must not exceed 10 characters"],
    },
    type: {
      type: String,
      enum: ["count", "weight", "volume", "length", "area", "time", "digital"],
      required: true,
      index: true,
    },
    baseUnit: { type: String },
    conversionFactor: { type: Number, default: 1 },
    isBase: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    tenantId: { type: String, required: true, default: "default", index: true },
    productCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// Compound unique: abbreviation per tenant
unitSchema.index({ abbreviation: 1, tenantId: 1 }, { unique: true });
unitSchema.index({ name: "text", abbreviation: "text" });

const Unit = mongoose.model<IUnit>("Unit", unitSchema);
export default Unit;
