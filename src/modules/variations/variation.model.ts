import mongoose, { Schema, Document, Types } from "mongoose";

export interface IVariationOption {
  _id?: Types.ObjectId;
  value: string;
  label: string;
  colorHex?: string; // For color-type variations
  sortOrder: number;
  isActive: boolean;
}

export interface IVariation extends Document {
  _id: Types.ObjectId;
  name: string; // e.g. "Color", "Size", "Flavor"
  slug: string;
  type: "text" | "color" | "image" | "button";
  options: IVariationOption[];
  isActive: boolean;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const variationOptionSchema = new Schema<IVariationOption>(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    colorHex: { type: String, match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/ },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const variationSchema = new Schema<IVariation>(
  {
    name: {
      type: String,
      required: [true, "Variation name is required"],
      trim: true,
      maxlength: [60, "Variation name must not exceed 60 characters"],
    },
    slug: { type: String, lowercase: true },
    type: {
      type: String,
      enum: ["text", "color", "image", "button"],
      default: "text",
    },
    options: { type: [variationOptionSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    tenantId: { type: String, required: true, default: "default", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

variationSchema.index({ slug: 1, tenantId: 1 }, { unique: true });
variationSchema.index({ name: "text" });

const Variation = mongoose.model<IVariation>("Variation", variationSchema);
export default Variation;
