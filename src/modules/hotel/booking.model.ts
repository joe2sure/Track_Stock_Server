import mongoose, { Schema, Document, Types } from "mongoose";

export type BookingStatus =
  | "enquiry"
  | "reserved"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type BookingSource =
  | "walk_in"
  | "phone"
  | "website"
  | "booking_com"
  | "airbnb"
  | "expedia"
  | "travel_agent"
  | "corporate"
  | "other";

export interface IGuest {
  name: string;
  phone?: string;
  email?: string;
  idType?: "passport" | "national_id" | "drivers_license" | "other";
  idNumber?: string;
  nationality?: string;
  isMainGuest: boolean;
}

export interface IFolioCharge {
  _id?: Types.ObjectId;
  type:
    | "room_charge"
    | "food_beverage"
    | "laundry"
    | "minibar"
    | "transport"
    | "telephone"
    | "service"
    | "discount"
    | "tax"
    | "other";
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  date: Date;
  postedBy: Types.ObjectId;
  isVoid: boolean;
}

export interface IFolioPayment {
  _id?: Types.ObjectId;
  method:
    | "cash"
    | "card"
    | "transfer"
    | "credit"
    | "city_ledger"
    | "complimentary";
  amount: number;
  reference?: string;
  paidAt: Date;
  receivedBy: Types.ObjectId;
  notes?: string;
}

export interface IBooking extends Document {
  _id: Types.ObjectId;
  bookingNumber: string;
  roomId: Types.ObjectId;
  roomTypeId: Types.ObjectId;
  roomNumber: string; // snapshot
  roomTypeName: string; // snapshot

  status: BookingStatus;
  source: BookingSource;

  // Guest info
  guests: IGuest[];
  customerId?: Types.ObjectId;

  // Stay dates
  checkInDate: Date;
  checkOutDate: Date;
  actualCheckIn?: Date;
  actualCheckOut?: Date;
  nights: number;

  // Pricing
  ratePerNight: number;
  roomCharges: number; // nights × ratePerNight
  extraCharges: number; // sum of non-room folio charges
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;

  // Folio
  folioCharges: IFolioCharge[];
  folioPayments: IFolioPayment[];
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" | "refunded";

  // Extra info
  adults: number;
  children: number;
  specialRequests?: string;
  notes?: string;
  internalNotes?: string;

  // Corporate / group
  companyName?: string;
  corporateRate?: number;
  groupCode?: string;

  // Cancellation
  cancellationReason?: string;
  cancelledAt?: Date;
  cancellationPolicy?: string;
  cancellationCharge?: number;

  // Staff
  createdBy: Types.ObjectId;
  checkedInBy?: Types.ObjectId;
  checkedOutBy?: Types.ObjectId;

  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ──────────────────────────────────────────────────────────────
const guestSchema = new Schema<IGuest>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String },
    email: { type: String, lowercase: true },
    idType: {
      type: String,
      enum: ["passport", "national_id", "drivers_license", "other"],
    },
    idNumber: { type: String },
    nationality: { type: String, default: "Nigerian" },
    isMainGuest: { type: Boolean, default: false },
  },
  { _id: false },
);

const folioChargeSchema = new Schema<IFolioCharge>(
  {
    type: {
      type: String,
      enum: [
        "room_charge",
        "food_beverage",
        "laundry",
        "minibar",
        "transport",
        "telephone",
        "service",
        "discount",
        "tax",
        "other",
      ],
      required: true,
    },
    description: { type: String, required: true, maxlength: 300 },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    postedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isVoid: { type: Boolean, default: false },
  },
  { _id: true },
);

const folioPaymentSchema = new Schema<IFolioPayment>(
  {
    method: {
      type: String,
      enum: [
        "cash",
        "card",
        "transfer",
        "credit",
        "city_ledger",
        "complimentary",
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, maxlength: 200 },
  },
  { _id: true },
);

// ── Main schema ──────────────────────────────────────────────────────────────
const bookingSchema = new Schema<IBooking>(
  {
    bookingNumber: { type: String, required: true, unique: true, index: true },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    roomTypeId: {
      type: Schema.Types.ObjectId,
      ref: "RoomType",
      required: true,
      index: true,
    },
    roomNumber: { type: String, required: true },
    roomTypeName: { type: String, required: true },

    status: {
      type: String,
      enum: [
        "enquiry",
        "reserved",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
      default: "confirmed",
      index: true,
    },
    source: {
      type: String,
      enum: [
        "walk_in",
        "phone",
        "website",
        "booking_com",
        "airbnb",
        "expedia",
        "travel_agent",
        "corporate",
        "other",
      ],
      default: "walk_in",
    },

    guests: { type: [guestSchema], default: [] },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },

    checkInDate: { type: Date, required: true, index: true },
    checkOutDate: { type: Date, required: true },
    actualCheckIn: { type: Date },
    actualCheckOut: { type: Date },
    nights: { type: Number, required: true, min: 1 },

    ratePerNight: { type: Number, required: true, min: 0 },
    roomCharges: { type: Number, default: 0, min: 0 },
    extraCharges: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },

    folioCharges: { type: [folioChargeSchema], default: [] },
    folioPayments: { type: [folioPaymentSchema], default: [] },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "overpaid", "refunded"],
      default: "unpaid",
      index: true,
    },

    adults: { type: Number, default: 1, min: 1 },
    children: { type: Number, default: 0, min: 0 },
    specialRequests: { type: String, maxlength: 1000 },
    notes: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 1000 },

    companyName: { type: String },
    corporateRate: { type: Number, min: 0 },
    groupCode: { type: String },

    cancellationReason: { type: String, maxlength: 500 },
    cancelledAt: { type: Date },
    cancellationPolicy: { type: String },
    cancellationCharge: { type: Number, min: 0, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    checkedInBy: { type: Schema.Types.ObjectId, ref: "User" },
    checkedOutBy: { type: Schema.Types.ObjectId, ref: "User" },

    tenantId: { type: String, required: true, default: "default", index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────
bookingSchema.virtual("mainGuest").get(function (this: IBooking) {
  return this.guests.find((g) => g.isMainGuest) ?? this.guests[0];
});

bookingSchema.virtual("isOverdue").get(function (this: IBooking) {
  return this.status === "checked_in" && new Date() > this.checkOutDate;
});

// ── Indexes ───────────────────────────────────────────────────────────────────
bookingSchema.index({ checkInDate: 1, checkOutDate: 1, tenantId: 1 });
bookingSchema.index({ roomId: 1, checkInDate: 1, status: 1 });
bookingSchema.index({ status: 1, tenantId: 1 });
bookingSchema.index({ createdAt: -1 });

const Booking = mongoose.model<IBooking>("Booking", bookingSchema);
export default Booking;
