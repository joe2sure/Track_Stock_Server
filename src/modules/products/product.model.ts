import mongoose, { Schema, Document, Types } from "mongoose";
import slugify from "slugify";

// ── Sub-document interfaces ────────────────────────────────────────────────
export interface IProductImage {
  url: string;
  publicId: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface IProductVariant {
  _id?: Types.ObjectId;
  sku: string;
  name: string;
  attributes: Record<string, string>; // { Color: 'Red', Size: 'XL' }
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  compareAtPrice?: number;
  stockQuantity: number;
  reservedQuantity: number;
  minStockLevel: number;
  maxStockLevel?: number;
  barcode?: string;
  weight?: number;
  isActive: boolean;
  images: string[];
}

export interface IProductTax {
  isExempt: boolean;
  taxRate?: number;
  taxType?: string;
}

export interface IProductDimension {
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  unit: string;
}

export interface IProduct extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  barcode?: string;
  qrCode?: string;
  description?: string;
  shortDescription?: string;
  type: "simple" | "variable" | "bundle" | "service";
  categoryId: Types.ObjectId;
  brandId?: Types.ObjectId;
  unitId: Types.ObjectId;
  images: IProductImage[];
  tags: string[];

  // Pricing
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  compareAtPrice?: number;
  discountPercent?: number;

  // Stock (for simple products)
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number; // Virtual: stock - reserved
  minStockLevel: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;

  // Variable product
  hasVariants: boolean;
  variants: IProductVariant[];
  variationIds: Types.ObjectId[];

  // Tax
  tax: IProductTax;

  // Dimensions & weight
  dimensions?: IProductDimension;

  // Metadata
  status: "active" | "inactive" | "draft" | "archived";
  isTrackingStock: boolean;
  isAllowBackorder: boolean;
  isFeatured: boolean;
  isPerishable: boolean;
  expiryDate?: Date;
  expiryDays?: number; // Days before expiry to flag

  // SEO
  metaTitle?: string;
  metaDescription?: string;

  // Location
  warehouseId?: Types.ObjectId;
  locationCode?: string; // Shelf/bin location

  // Totals
  totalSold: number;
  totalRevenue: number;
  viewCount: number;

  tenantId: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ──────────────────────────────────────────────────────────────
const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String },
    altText: { type: String },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const productVariantSchema = new Schema<IProductVariant>(
  {
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    attributes: { type: Map, of: String, default: {} },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    minStockLevel: { type: Number, default: 0 },
    maxStockLevel: { type: Number },
    barcode: { type: String },
    weight: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
    images: [{ type: String }],
  },
  { _id: true },
);

const taxSchema = new Schema(
  {
    isExempt: { type: Boolean, default: false },
    taxRate: { type: Number, min: 0, max: 100 },
    taxType: { type: String },
  },
  { _id: false },
);

const dimensionSchema = new Schema(
  {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
    unit: { type: String, default: "cm" },
  },
  { _id: false },
);

// ── Main Product Schema ──────────────────────────────────────────────────────
const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Product name must not exceed 200 characters"],
      index: true,
    },
    slug: { type: String, lowercase: true, index: true },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    barcode: { type: String, sparse: true },
    qrCode: { type: String },
    description: { type: String, maxlength: 5000 },
    shortDescription: { type: String, maxlength: 500 },
    type: {
      type: String,
      enum: ["simple", "variable", "bundle", "service"],
      default: "simple",
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand" },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: "Unit",
      required: [true, "Unit is required"],
    },
    images: { type: [productImageSchema], default: [] },
    tags: [{ type: String, lowercase: true, trim: true }],

    // Pricing
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    discountPercent: { type: Number, min: 0, max: 100 },

    // Stock
    stockQuantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    minStockLevel: { type: Number, default: 0 },
    maxStockLevel: { type: Number },
    reorderPoint: { type: Number },
    reorderQuantity: { type: Number },

    // Variants
    hasVariants: { type: Boolean, default: false },
    variants: { type: [productVariantSchema], default: [] },
    variationIds: [{ type: Schema.Types.ObjectId, ref: "Variation" }],

    // Tax
    tax: { type: taxSchema, default: {} },
    dimensions: { type: dimensionSchema },

    // Metadata
    status: {
      type: String,
      enum: ["active", "inactive", "draft", "archived"],
      default: "active",
      index: true,
    },
    isTrackingStock: { type: Boolean, default: true },
    isAllowBackorder: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isPerishable: { type: Boolean, default: false },
    expiryDate: { type: Date },
    expiryDays: { type: Number },

    // SEO
    metaTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 160 },

    // Location
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
    locationCode: { type: String, trim: true },

    // Totals (denormalized for performance)
    totalSold: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },

    tenantId: { type: String, required: true, default: "default", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────
productSchema.virtual("availableQuantity").get(function (
  this: IProduct,
): number {
  return Math.max(0, this.stockQuantity - this.reservedQuantity);
});

productSchema.virtual("stockStatus").get(function (this: IProduct): string {
  const available = this.stockQuantity - this.reservedQuantity;
  if (!this.isTrackingStock) return "in_stock";
  if (available <= 0) return "out_of_stock";
  if (available <= this.minStockLevel) return "low_stock";
  return "in_stock";
});

productSchema.virtual("profitMargin").get(function (this: IProduct): number {
  if (this.sellingPrice === 0) return 0;
  return parseFloat(
    (((this.sellingPrice - this.costPrice) / this.sellingPrice) * 100).toFixed(
      2,
    ),
  );
});

productSchema.virtual("primaryImage").get(function (this: IProduct): string {
  const primary = this.images.find((img) => img.isPrimary);
  return primary?.url ?? this.images[0]?.url ?? "";
});

// ── Pre-save hooks ────────────────────────────────────────────────────────────
productSchema.pre("validate", function (this: IProduct) {
  if (this.isModified("name") || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true, trim: true });
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
productSchema.index({ sku: 1, tenantId: 1 }, { unique: true });
productSchema.index({ slug: 1, tenantId: 1 });
productSchema.index({ barcode: 1, tenantId: 1 }, { sparse: true });
productSchema.index({ categoryId: 1, tenantId: 1, status: 1 });
productSchema.index({ brandId: 1, tenantId: 1 });
productSchema.index({ status: 1, tenantId: 1 });
productSchema.index({ stockQuantity: 1, minStockLevel: 1, tenantId: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index(
  { name: "text", description: "text", sku: "text", tags: "text" },
  { weights: { name: 10, sku: 8, tags: 5, description: 1 } },
);

const Product = mongoose.model<IProduct>("Product", productSchema);
export default Product;
