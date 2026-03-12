import mongoose, { Schema, Document, Types } from 'mongoose';

export type HKTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'issue_reported';
export type HKTaskType   = 'checkout_clean' | 'stayover_clean' | 'deep_clean' | 'turndown' | 'inspection' | 'maintenance_prep';

export interface IHousekeepingTask extends Document {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  roomNumber: string;    // snapshot
  taskType: HKTaskType;
  status: HKTaskStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: Types.ObjectId;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
  issueDescription?: string;    // For issue_reported status
  checklistCompleted: string[];  // e.g. ["Bed made", "Towels replaced", "Bathroom cleaned"]
  bookingId?: Types.ObjectId;    // Context booking (checkout/stayover)
  scheduledDate: Date;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const housekeepingSchema = new Schema<IHousekeepingTask>(
  {
    roomId:      { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    roomNumber:  { type: String, required: true },
    taskType: {
      type: String,
      enum: ['checkout_clean','stayover_clean','deep_clean','turndown','inspection','maintenance_prep'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending','in_progress','completed','skipped','issue_reported'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low','normal','high','urgent'],
      default: 'normal',
      index: true,
    },
    assignedTo:          { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignedAt:          { type: Date },
    startedAt:           { type: Date },
    completedAt:         { type: Date },
    notes:               { type: String, maxlength: 500 },
    issueDescription:    { type: String, maxlength: 500 },
    checklistCompleted:  [{ type: String }],
    bookingId:           { type: Schema.Types.ObjectId, ref: 'Booking' },
    scheduledDate:       { type: Date, required: true, index: true },
    tenantId:            { type: String, required: true, default: 'default', index: true },
    createdBy:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

housekeepingSchema.virtual('durationMinutes').get(function (this: IHousekeepingTask) {
  if (this.startedAt && this.completedAt) {
    return Math.round((this.completedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
  return null;
});

housekeepingSchema.index({ scheduledDate: 1, tenantId: 1 });
housekeepingSchema.index({ assignedTo: 1, scheduledDate: 1 });

const HousekeepingTask = mongoose.model<IHousekeepingTask>('HousekeepingTask', housekeepingSchema);
export default HousekeepingTask;
