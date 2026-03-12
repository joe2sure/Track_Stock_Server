import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICurrency extends Document {
  _id: Types.ObjectId;
  code: string;              // ISO 4217: "NGN", "USD", "GBP"
  name: string;              // "Nigerian Naira"
  symbol: string;            // "₦", "$", "£"
  exchangeRate: number;      // Rate relative to base currency (NGN = 1)
  isBase: boolean;           // Only one per tenant
  isActive: boolean;
  decimalPlaces: number;
  lastUpdatedAt: Date;
  tenantId: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const currencySchema = new Schema<ICurrency>(
  {
    code:          { type: String, required: true, trim: true, uppercase: true, maxlength: 3 },
    name:          { type: String, required: true, trim: true, maxlength: 100 },
    symbol:        { type: String, required: true, maxlength: 5 },
    exchangeRate:  { type: Number, required: true, min: 0, default: 1 },
    isBase:        { type: Boolean, default: false },
    isActive:      { type: Boolean, default: true, index: true },
    decimalPlaces: { type: Number, default: 2, min: 0, max: 4 },
    lastUpdatedAt: { type: Date, default: Date.now },
    tenantId:      { type: String, required: true, default: 'default', index: true },
    updatedBy:     { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

currencySchema.index({ code: 1, tenantId: 1 }, { unique: true });

const Currency = mongoose.model<ICurrency>('Currency', currencySchema);
export default Currency;
