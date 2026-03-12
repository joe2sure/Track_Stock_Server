import mongoose, { Schema, Document, Types } from 'mongoose';

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface IExpense extends Document {
  _id: Types.ObjectId;
  expenseNumber: string;
  title: string;
  description?: string;
  category: string;              // e.g. "Travel", "Office Supplies", "Utilities", "Repairs"
  amount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  expenseDate: Date;
  status: ExpenseStatus;

  // Who incurred the expense
  submittedBy: Types.ObjectId;   // Staff or User
  staffId?: Types.ObjectId;      // Staff record reference
  warehouseId?: Types.ObjectId;  // Which branch / location

  // Payment
  paymentMethod?: 'cash' | 'bank_transfer' | 'card' | 'petty_cash';
  paidAt?: Date;
  paymentReference?: string;

  // Approval
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;

  // Receipts / docs
  receipts: Array<{ name: string; url: string; uploadedAt: Date }>;

  isBillable: boolean;           // Can be re-billed to a client
  notes?: string;
  tags?: string[];
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    expenseNumber: { type: String, required: true, index: true },
    title:         { type: String, required: true, trim: true, maxlength: 200 },
    description:   { type: String, maxlength: 1000 },
    category: {
      type: String, required: true, trim: true, maxlength: 100, index: true,
    },
    amount:        { type: Number, required: true, min: 0 },
    taxAmount:     { type: Number, default: 0, min: 0 },
    totalAmount:   { type: Number, required: true, min: 0 },
    currency:      { type: String, default: 'NGN', uppercase: true },
    expenseDate:   { type: Date, required: true, index: true },

    status: {
      type: String,
      enum: ['draft','submitted','approved','rejected','paid','cancelled'],
      default: 'draft',
      index: true,
    },

    submittedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    staffId:      { type: Schema.Types.ObjectId, ref: 'Staff' },
    warehouseId:  { type: Schema.Types.ObjectId, ref: 'Warehouse' },

    paymentMethod:    { type: String, enum: ['cash','bank_transfer','card','petty_cash'] },
    paidAt:           { type: Date },
    paymentReference: { type: String },

    reviewedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  { type: Date },
    reviewNotes: { type: String, maxlength: 500 },

    receipts: [{
      name:       { type: String },
      url:        { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],

    isBillable: { type: Boolean, default: false },
    notes:      { type: String, maxlength: 1000 },
    tags:       [{ type: String, lowercase: true }],
    tenantId:   { type: String, required: true, default: 'default', index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

expenseSchema.index({ expenseNumber: 1, tenantId: 1 }, { unique: true });
expenseSchema.index({ submittedBy: 1, tenantId: 1 });
expenseSchema.index({ expenseDate: -1, tenantId: 1 });
expenseSchema.index({ status: 1, tenantId: 1 });

const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
export default Expense;
