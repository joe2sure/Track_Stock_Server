import mongoose, { Schema, Document, Types } from 'mongoose';

export type AssetStatus      = 'active' | 'under_repair' | 'disposed' | 'stolen' | 'written_off';
export type DepreciationMethod = 'straight_line' | 'reducing_balance' | 'none';

export interface IAssetMaintenance {
  _id?: Types.ObjectId;
  date: Date;
  description: string;
  cost: number;
  vendor?: string;
  nextDueDate?: Date;
  performedBy: Types.ObjectId;
}

export interface IAsset extends Document {
  _id: Types.ObjectId;
  assetNumber: string;
  name: string;
  description?: string;
  category: string;              // e.g. "Computer Equipment", "Furniture", "Vehicle"
  brand?: string;
  model?: string;
  serialNumber?: string;

  // Location & assignment
  warehouseId?: Types.ObjectId;
  assignedTo?: Types.ObjectId;   // Staff member
  assignedAt?: Date;
  location?: string;             // Physical description, e.g. "Room 201, Floor 2"

  // Financial
  purchaseDate: Date;
  purchaseCost: number;
  currency: string;
  supplierId?: Types.ObjectId;
  invoiceNumber?: string;

  // Depreciation
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  salvageValue: number;
  currentValue: number;          // Updated periodically
  depreciationRate: number;      // % per year for reducing balance

  // Status
  status: AssetStatus;
  disposalDate?: Date;
  disposalValue?: number;
  disposalReason?: string;
  warrantyExpiry?: Date;

  // Maintenance history
  maintenanceHistory: IAssetMaintenance[];
  nextMaintenanceDate?: Date;

  notes?: string;
  images: string[];
  isActive: boolean;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const maintenanceSchema = new Schema<IAssetMaintenance>({
  date:          { type: Date, required: true },
  description:   { type: String, required: true, maxlength: 500 },
  cost:          { type: Number, default: 0, min: 0 },
  vendor:        { type: String },
  nextDueDate:   { type: Date },
  performedBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: true });

const assetSchema = new Schema<IAsset>(
  {
    assetNumber:  { type: String, required: true, index: true },
    name:         { type: String, required: true, trim: true, maxlength: 150 },
    description:  { type: String, maxlength: 1000 },
    category:     { type: String, required: true, trim: true, maxlength: 100, index: true },
    brand:        { type: String },
    model:        { type: String },
    serialNumber: { type: String },

    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    assignedTo:  { type: Schema.Types.ObjectId, ref: 'Staff', index: true },
    assignedAt:  { type: Date },
    location:    { type: String, maxlength: 200 },

    purchaseDate:    { type: Date, required: true },
    purchaseCost:    { type: Number, required: true, min: 0 },
    currency:        { type: String, default: 'NGN', uppercase: true },
    supplierId:      { type: Schema.Types.ObjectId, ref: 'Supplier' },
    invoiceNumber:   { type: String },

    depreciationMethod: {
      type: String, enum: ['straight_line','reducing_balance','none'], default: 'straight_line',
    },
    usefulLifeYears:  { type: Number, default: 5, min: 0 },
    salvageValue:     { type: Number, default: 0, min: 0 },
    currentValue:     { type: Number, min: 0 },
    depreciationRate: { type: Number, default: 20, min: 0, max: 100 },

    status: {
      type: String, enum: ['active','under_repair','disposed','stolen','written_off'], default: 'active', index: true,
    },
    disposalDate:   { type: Date },
    disposalValue:  { type: Number, min: 0 },
    disposalReason: { type: String, maxlength: 500 },
    warrantyExpiry: { type: Date },

    maintenanceHistory: { type: [maintenanceSchema], default: [] },
    nextMaintenanceDate: { type: Date },

    notes:    { type: String, maxlength: 1000 },
    images:   [{ type: String }],
    isActive: { type: Boolean, default: true },
    tenantId: { type: String, required: true, default: 'default', index: true },
    createdBy:{ type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

assetSchema.virtual('age').get(function (this: IAsset) {
  const end  = this.disposalDate ?? new Date();
  const diff = end.getTime() - this.purchaseDate.getTime();
  return parseFloat((diff / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
});

assetSchema.virtual('accumulatedDepreciation').get(function (this: IAsset) {
  return Math.max(0, this.purchaseCost - this.currentValue);
});

assetSchema.virtual('isWarrantyExpired').get(function (this: IAsset) {
  return this.warrantyExpiry ? this.warrantyExpiry < new Date() : null;
});

assetSchema.index({ assetNumber: 1, tenantId: 1 }, { unique: true });
assetSchema.index({ category: 1, tenantId: 1 });
assetSchema.index({ name: 'text', serialNumber: 'text', assetNumber: 'text' });

const Asset = mongoose.model<IAsset>('Asset', assetSchema);
export default Asset;
