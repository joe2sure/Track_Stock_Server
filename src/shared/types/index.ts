import { Request } from 'express';
import { Document, Types } from 'mongoose';

// ── Auth / User Types ────────────────────────────────────────────────────────
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'warehouse_staff'
  | 'hotel_staff'
  | 'accountant'
  | 'staff';

export type BusinessMode = 'store' | 'hotel' | 'all';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    tenantId: string;
    sessionId: string;
  };
  tenantId?: string;
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

// ── Pagination Types ─────────────────────────────────────────────────────────
export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ── API Response Types ───────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: PaginationMeta;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// ── Database Base Types ──────────────────────────────────────────────────────
export interface BaseDocument extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeleteDocument extends BaseDocument {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
}

// ── Address Type ─────────────────────────────────────────────────────────────
export interface Address {
  street?: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
}

// ── Contact Type ─────────────────────────────────────────────────────────────
export interface ContactInfo {
  email?: string;
  phone?: string;
  whatsapp?: string;
}

// ── Money Type ───────────────────────────────────────────────────────────────
export interface Money {
  amount: number;
  currency: string;
}

// ── File / Media Type ────────────────────────────────────────────────────────
export interface MediaFile {
  url: string;
  publicId: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  folder?: string;
}

// ── Audit Log Type ───────────────────────────────────────────────────────────
export interface AuditEntry {
  action: string;
  performedBy: Types.ObjectId;
  performedAt: Date;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ── Payment Types ────────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'pos' | 'paystack' | 'credit';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'failed' | 'refunded' | 'cancelled';

// ── Status Types ─────────────────────────────────────────────────────────────
export type ItemStatus = 'active' | 'inactive' | 'archived';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

// ── Filter Builder ───────────────────────────────────────────────────────────
export type FilterQuery<T> = {
  [K in keyof T]?: T[K] | { $in: T[K][] } | { $regex: string; $options: string } | { $gte?: T[K]; $lte?: T[K] };
} & {
  isDeleted?: boolean;
  $or?: Array<Partial<Record<string, unknown>>>;
  $and?: Array<Partial<Record<string, unknown>>>;
};

// ── WebSocket Event Types ────────────────────────────────────────────────────
export type WsEventType =
  | 'connected'
  | 'disconnected'
  | 'low_stock_alert'
  | 'new_order'
  | 'payment_received'
  | 'room_status_change'
  | 'stock_transfer'
  | 'expense_approved'
  | 'notification'
  | 'ping'
  | 'pong';

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
  tenantId: string;
  timestamp: string;
  id: string;
}

// ── Date Range ───────────────────────────────────────────────────────────────
export interface DateRange {
  from: Date;
  to: Date;
}

// ── Sort Options ─────────────────────────────────────────────────────────────
export interface SortOptions {
  [key: string]: 1 | -1;
}

// ── Express Multer extension ─────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: UserRole;
        tenantId: string;
        sessionId: string;
      };
      tenantId?: string;
    }
  }
}
