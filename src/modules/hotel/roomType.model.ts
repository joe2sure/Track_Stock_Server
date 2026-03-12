import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRoomType extends Document {
  _id: Types.ObjectId;
  name: string;                    // e.g. "Standard", "Deluxe", "Suite"
  code: string;                    // e.g. "STD", "DLX", "STE"
  description?: string;
  basePrice: number;               // Price per night
  weekendPrice?: number;           // Override on Fri/Sat
  maxOccupancy: number;
  bedType: 'single' | 'double' | 'twin' | 'queen' | 'king' | 'bunk';
  amenities: string[];             // ["WiFi", "AC", "TV", "Minibar"]
  images: string[];
  isActive: boolean;
  sortOrder: number;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roomTypeSchema = new Schema<IRoomType>(
  {
    name:         { type: String, required: true, trim: true, maxlength: 100 },
    code:         { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    description:  { type: String, maxlength: 1000 },
    basePrice:    { type: Number, required: true, min: 0 },
    weekendPrice: { type: Number, min: 0 },
    maxOccupancy: { type: Number, required: true, min: 1, default: 2 },
    bedType: {
      type: String,
      enum: ['single','double','twin','queen','king','bunk'],
      default: 'double',
    },
    amenities: [{ type: String, trim: true }],
    images:    [{ type: String }],
    isActive:  { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    tenantId:  { type: String, required: true, default: 'default', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

roomTypeSchema.index({ code: 1, tenantId: 1 }, { unique: true });
roomTypeSchema.index({ name: 'text' });

const RoomType = mongoose.model<IRoomType>('RoomType', roomTypeSchema);
export default RoomType;
