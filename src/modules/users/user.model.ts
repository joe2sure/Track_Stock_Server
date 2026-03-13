import mongoose, { Schema, Document, Types } from "mongoose";
import { UserRole } from "../../shared/types";

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface IUserPreferences {
  language: string;
  currency: string;
  timezone: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    lowStock: boolean;
    newOrder: boolean;
    paymentAlert: boolean;
    weeklyReport: boolean;
  };
  theme: string;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  employeeId?: string;
  department?: string;
  pin?: string; // 4-6 digit PIN for quick POS access
  pinExpiresAt?: Date;
  tenantId: string; // Multi-tenant support (branch/store ID)
  isActive: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  lastLogin?: Date;
  lastLoginIp?: string;
  loginAttempts: number;
  lockUntil?: Date;
  refreshTokens: Array<{
    token: string;
    sessionId: string;
    device?: string;
    ipAddress?: string;
    createdAt: Date;
    expiresAt: Date;
  }>;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  otp?: string;
  otpExpires?: Date;
  otpPurpose?: "phone_verify" | "login" | "password_reset";
  preferences: IUserPreferences;
  permissions?: string[]; // Custom permission overrides
  createdAt: Date;
  updatedAt: Date;
  isLocked: boolean; // Virtual
}

// ── Schema ────────────────────────────────────────────────────────────────────
const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    language: { type: String, default: "en" },
    currency: { type: String, default: "NGN" },
    timezone: { type: String, default: "Africa/Lagos" },
    theme: { type: String, default: "blue" },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      newOrder: { type: Boolean, default: true },
      paymentAlert: { type: Boolean, default: false },
      weeklyReport: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name must not exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never return password in queries
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "admin",
        "manager",
        "cashier",
        "warehouse_staff",
        "hotel_staff",
        "accountant",
        "staff",
      ],
      default: "staff",
      index: true,
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },
    department: { type: String },
    pin: {
      type: String,
      select: false,
    },
    pinExpiresAt: { type: Date },
    tenantId: {
      type: String,
      required: true,
      default: "default",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: { type: Date },
    lastLoginIp: { type: String },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: { type: Date },
    refreshTokens: [
      {
        token: { type: String, required: true },
        sessionId: { type: String, required: true },
        device: { type: String },
        ipAddress: { type: String },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
      },
    ],
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpPurpose: {
      type: String,
      enum: ["phone_verify", "login", "password_reset"],
      select: false,
    },
    preferences: {
      type: userPreferencesSchema,
      default: (): IUserPreferences => ({
        language: "en",
        currency: "NGN",
        timezone: "Africa/Lagos",
        theme: "blue",
        notifications: {
          email: true,
          sms: false,
          push: true,
          lowStock: true,
          newOrder: true,
          paymentAlert: false,
          weeklyReport: false,
        },
      }),
    },
    permissions: [{ type: String }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc: any, ret: Record<string, any>) {
        delete ret.password;
        delete ret.pin;
        delete ret.refreshTokens;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.emailVerificationToken;
        delete ret.otp;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ──────────────────────────────────────────────────────────────────
userSchema.virtual("isLocked").get(function (this: IUser): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ email: 1, tenantId: 1 });
userSchema.index({ role: 1, tenantId: 1 });
userSchema.index({ isActive: 1, tenantId: 1 });
userSchema.index({ createdAt: -1 });

// ── Instance methods ──────────────────────────────────────────────────────────
userSchema.methods.incLoginAttempts = async function (): Promise<void> {
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

  if (this.lockUntil && this.lockUntil < new Date()) {
    // Lock period expired — reset
    await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
    return;
  }

  const updates: Record<string, unknown> = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
  }

  await this.updateOne(updates);
};

// ── Static methods ────────────────────────────────────────────────────────────
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() }).select("+password");
};

const User = mongoose.model<IUser>("User", userSchema);
export default User;
