import mongoose, { Schema, Document, Types } from 'mongoose';

export type ReturnStatus = 'pending' | 'dispatched' | 'acknowledged' | 'credited' | 'cancelled';

export interface IPurchaseReturnItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string;
  sku: string;
  returnQuantity: number;
  unitCost: number;
  total: number;
  reason: 'damaged' | 'wrong_item' | 'expired' | 'excess' | 'quality_issue' | 'other';
  notes?: string;
}

export interface IPurchaseReturn extends Document {
  _id: Types.ObjectId;
  returnNumber: string;
  purchaseOrderId?: Types.ObjectId;
  poNumber?: string;
  grnId?: Types.ObjectId;
  grnNumber?: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  warehouseId: Types.ObjectId;
  status: ReturnStatus;
  items: IPurchaseReturnItem[];
  totalAmount: number;
  creditNoteNumber?: string;      // Supplier's credit note ref
  refundMethod?: 'credit_note' | 'bank_transfer' | 'deduction';
  refundAmount?: number;
  notes?: string;
  returnedBy: Types.ObjectId;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const returnItemSchema = new Schema<IPurchaseReturnItem>({
  productId:      { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId:      { type: Schema.Types.ObjectId, default: null },
  name:           { type: String, required: true },
  sku:            { type: String, required: true },
  returnQuantity: { type: Number, required: true, min: 0.001 },
  unitCost:       { type: Number, required: true, min: 0 },
  total:          { type: Number, required: true, min: 0 },
  reason: {
    type: String,
    enum: ['damaged','wrong_item','expired','excess','quality_issue','other'],
    required: true,
  },
  notes: { type: String, maxlength: 300 },
}, { _id: true });

const purchaseReturnSchema = new Schema<IPurchaseReturn>(
  {
    returnNumber:     { type: String, required: true, unique: true, index: true },
    purchaseOrderId:  { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    poNumber:         { type: String },
    grnId:            { type: Schema.Types.ObjectId, ref: 'GRN' },
    grnNumber:        { type: String },
    supplierId:       { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName:     { type: String, required: true },
    warehouseId:      { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    status: {
      type: String,
      enum: ['pending','dispatched','acknowledged','credited','cancelled'],
      default: 'pending',
      index: true,
    },
    items:            { type: [returnItemSchema], default: [] },
    totalAmount:      { type: Number, default: 0, min: 0 },
    creditNoteNumber: { type: String },
    refundMethod:     { type: String, enum: ['credit_note','bank_transfer','deduction'] },
    refundAmount:     { type: Number, min: 0 },
    notes:            { type: String, maxlength: 1000 },
    returnedBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt:   { type: Date },
    tenantId:         { type: String, required: true, default: 'default', index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

purchaseReturnSchema.index({ createdAt: -1, tenantId: 1 });

const PurchaseReturn = mongoose.model<IPurchaseReturn>('PurchaseReturn', purchaseReturnSchema);
export default PurchaseReturn;
