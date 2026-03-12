import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentGateway = 'paystack' | 'cash' | 'bank_transfer' | 'pos_terminal';
export type PaymentStatus  = 'pending' | 'success' | 'failed' | 'abandoned' | 'reversed';
export type PaymentChannel = 'card' | 'bank' | 'ussd' | 'qr' | 'mobile_money' | 'bank_transfer' | 'cash';

export interface IPayment extends Document {
  _id: Types.ObjectId;
  reference: string;              // Unique payment reference
  gateway: PaymentGateway;
  status: PaymentStatus;
  channel?: PaymentChannel;

  // Amounts
  amount: number;                 // In kobo (Paystack) or smallest unit
  amountNGN: number;              // Human-readable NGN
  currency: string;
  fee?: number;                   // Gateway fee
  netAmount?: number;             // amount - fee

  // Linked entity
  entityType: 'sale' | 'booking' | 'purchase' | 'expense' | 'other';
  entityId?: Types.ObjectId;
  entityRef?: string;             // Human-readable ref (order number, booking number)

  // Payer info
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;

  // Paystack-specific
  paystackId?: string;            // Paystack transaction ID
  paystackRef?: string;           // Paystack reference
  authorizationCode?: string;     // For recurring charges
  cardType?: string;
  cardLast4?: string;
  bank?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  paidAt?: Date;
  failureReason?: string;
  webhookData?: Record<string, unknown>;

  tenantId: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    reference:    { type: String, required: true, index: true },
    gateway:      { type: String, enum: ['paystack','cash','bank_transfer','pos_terminal'], required: true },
    status: {
      type: String,
      enum: ['pending','success','failed','abandoned','reversed'],
      default: 'pending',
      index: true,
    },
    channel: { type: String, enum: ['card','bank','ussd','qr','mobile_money','bank_transfer','cash'] },

    amount:     { type: Number, required: true, min: 0 },
    amountNGN:  { type: Number, required: true, min: 0 },
    currency:   { type: String, default: 'NGN', uppercase: true },
    fee:        { type: Number, min: 0 },
    netAmount:  { type: Number, min: 0 },

    entityType: {
      type: String,
      enum: ['sale','booking','purchase','expense','other'],
      required: true,
    },
    entityId:  { type: Schema.Types.ObjectId },
    entityRef: { type: String },

    customerEmail: { type: String, lowercase: true },
    customerName:  { type: String },
    customerPhone: { type: String },

    paystackId:        { type: String, sparse: true },
    paystackRef:       { type: String },
    authorizationCode: { type: String },
    cardType:          { type: String },
    cardLast4:         { type: String },
    bank:              { type: String },

    metadata:       { type: Schema.Types.Mixed },
    paidAt:         { type: Date },
    failureReason:  { type: String },
    webhookData:    { type: Schema.Types.Mixed },

    tenantId:   { type: String, required: true, default: 'default', index: true },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

paymentSchema.index({ reference: 1, tenantId: 1 }, { unique: true });
paymentSchema.index({ entityId: 1, entityType: 1 });
paymentSchema.index({ status: 1, tenantId: 1 });
paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
