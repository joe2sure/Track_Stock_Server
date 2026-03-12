import mongoose, { Schema, Document, Types } from 'mongoose';
import slugify from 'slugify';

export interface IBrand extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  country?: string;
  isActive: boolean;
  tenantId: string;
  productCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrand>(
  {
    name: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true,
      maxlength: [100, 'Brand name must not exceed 100 characters'],
    },
    slug:        { type: String, lowercase: true, index: true },
    description: { type: String, maxlength: 500 },
    logo:        { type: String },
    website:     { type: String },
    country:     { type: String, trim: true },
    isActive:    { type: Boolean, default: true, index: true },
    tenantId:    { type: String, required: true, default: 'default', index: true },
    productCount:{ type: Number, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

brandSchema.pre('validate', function (this: IBrand) {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

brandSchema.index({ slug: 1, tenantId: 1 }, { unique: true });
brandSchema.index({ name: 'text', description: 'text' });

const Brand = mongoose.model<IBrand>('Brand', brandSchema);
export default Brand;
