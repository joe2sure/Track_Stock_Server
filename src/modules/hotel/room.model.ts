import mongoose, { Schema, Document, Types } from 'mongoose';

export type RoomStatus =
  | 'available'
  | 'occupied'
  | 'reserved'        // Booking confirmed, not yet checked in
  | 'cleaning'
  | 'maintenance'
  | 'out_of_order'
  | 'blocked';        // Admin hold

export interface IRoom extends Document {
  _id: Types.ObjectId;
  roomNumber: string;
  floor: number;
  building?: string;
  roomTypeId: Types.ObjectId;
  status: RoomStatus;
  isClean: boolean;
  lastCleanedAt?: Date;
  lastCleanedBy?: Types.ObjectId;
  notes?: string;
  maintenanceNote?: string;
  currentBookingId?: Types.ObjectId;  // Active booking
  priceOverride?: number;              // Override room type base price
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    roomNumber:       { type: String, required: true, trim: true, maxlength: 20 },
    floor:            { type: Number, required: true, min: 0 },
    building:         { type: String, trim: true },
    roomTypeId:       { type: Schema.Types.ObjectId, ref: 'RoomType', required: true, index: true },
    status: {
      type: String,
      enum: ['available','occupied','reserved','cleaning','maintenance','out_of_order','blocked'],
      default: 'available',
      index: true,
    },
    isClean:          { type: Boolean, default: true },
    lastCleanedAt:    { type: Date },
    lastCleanedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    notes:            { type: String, maxlength: 500 },
    maintenanceNote:  { type: String, maxlength: 500 },
    currentBookingId: { type: Schema.Types.ObjectId, ref: 'Booking', sparse: true },
    priceOverride:    { type: Number, min: 0 },
    tenantId:         { type: String, required: true, default: 'default', index: true },
    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

roomSchema.index({ roomNumber: 1, tenantId: 1 }, { unique: true });
roomSchema.index({ status: 1, tenantId: 1 });
roomSchema.index({ floor: 1, tenantId: 1 });

const Room = mongoose.model<IRoom>('Room', roomSchema);
export default Room;
