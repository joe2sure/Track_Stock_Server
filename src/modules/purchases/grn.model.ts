import mongoose, { Schema, Document, Types } from 'mongoose';

export type GRNStatus = 'draft' | 'confirmed' | 'cancelled';

export interface IGRNItem {
  _id?: Types.ObjectId;
  poItemId: Types.ObjectId;       // Links to PO line item
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string;
  sku: string;
  orderedQuantity: number;        // From PO
  receivedQuantity: number;       // Actually received in this GRN
  rejectedQuantity: number;       // Damaged / wrong item
  acceptedQuantity: number;       // received - rejected
  unitCost: number;
  batchNumber?: string;
  expiryDate?: Date;
  locationCode?: string;          // Shelf/bin in warehouse
  notes?: string;
}

export interface IGRN extends Document {
  _id: Types.ObjectId;
  grnNumber: string;
  purchaseOrderId: Types.ObjectId;
  poNumber: string;               // Snapshot
  supplierId: Types.ObjectId;
  supplierName: string;           // Snapshot
  warehouseId: Types.ObjectId;
  status: GRNStatus;
  items: IGRNItem[];
  deliveryNote?: string;          // Supplier's delivery note number
  vehicleNumber?: string;
  driverName?: string;
  notes?: string;
  internalNotes?: string;
  receivedBy: Types.ObjectId;
  confirmedBy?: Types.ObjectId;
  confirmedAt?: Date;
  receivedAt: Date;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const grnItemSchema = new Schema<IGRNItem>({
  poItemId:         { type: Schema.Types.ObjectId, required: true },
  productId:        { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId:        { type: Schema.Types.ObjectId, default: null },
  name:             { type: String, required: true },
  sku:              { type: String, required: true },
  orderedQuantity:  { type: Number, required: true, min: 0 },
  receivedQuantity: { type: Number, required: true, min: 0 },
  rejectedQuantity: { type: Number, default: 0, min: 0 },
  acceptedQuantity: { type: Number, required: true, min: 0 },
  unitCost:         { type: Number, required: true, min: 0 },
  batchNumber:      { type: String },
  expiryDate:       { type: Date },
  locationCode:     { type: String },
  notes:            { type: String, maxlength: 300 },
}, { _id: true });

const grnSchema = new Schema<IGRN>(
  {
    grnNumber: {
      type: String, required: true, unique: true, index: true,
    },
    purchaseOrderId: {
      type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true,
    },
    poNumber:        { type: String, required: true },
    supplierId:      { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName:    { type: String, required: true },
    warehouseId:     { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    status: {
      type: String,
      enum: ['draft','confirmed','cancelled'],
      default: 'draft',
      index: true,
    },
    items:          { type: [grnItemSchema], default: [] },
    deliveryNote:   { type: String },
    vehicleNumber:  { type: String },
    driverName:     { type: String },
    notes:          { type: String, maxlength: 1000 },
    internalNotes:  { type: String, maxlength: 1000 },
    receivedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt:    { type: Date },
    receivedAt:     { type: Date, default: Date.now, index: true },
    tenantId:       { type: String, required: true, default: 'default', index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

grnSchema.virtual('totalAccepted').get(function (this: IGRN) {
  return this.items.reduce((s, i) => s + i.acceptedQuantity, 0);
});
grnSchema.virtual('totalRejected').get(function (this: IGRN) {
  return this.items.reduce((s, i) => s + i.rejectedQuantity, 0);
});
grnSchema.virtual('totalValue').get(function (this: IGRN) {
  return this.items.reduce((s, i) => s + i.acceptedQuantity * i.unitCost, 0);
});

grnSchema.index({ receivedAt: -1, tenantId: 1 });
grnSchema.index({ supplierId: 1, tenantId: 1 });

const GRN = mongoose.model<IGRN>('GRN', grnSchema);
export default GRN;
