import mongoose, { Schema, Document, Types } from "mongoose";
import slugify from "slugify";

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parentId?: Types.ObjectId;
  tenantId: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: [100, "Category name must not exceed 100 characters"],
    },
    slug: {
      type: String,
      lowercase: true,
      index: true,
    },
    description: { type: String, maxlength: 500 },
    image: { type: String },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    tenantId: { type: String, required: true, default: "default", index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    productCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Auto-generate slug
categorySchema.pre("validate", function (this: ICategory) {
  if (this.isModified("name") || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true, trim: true });
  }
});

// Compound unique: slug + tenantId
categorySchema.index({ slug: 1, tenantId: 1 }, { unique: true });
categorySchema.index({ parentId: 1, tenantId: 1 });
categorySchema.index({ name: "text", description: "text" });

// Virtual: children
categorySchema.virtual("children", {
  ref: "Category",
  localField: "_id",
  foreignField: "parentId",
});

const Category = mongoose.model<ICategory>("Category", categorySchema);
export default Category;
