import mongoose, { Schema, Document, Types } from 'mongoose';

// ── Permission registry ───────────────────────────────────────────────────────
// Each permission is a string: "resource:action"
// Resources: products, categories, brands, units, variations,
//            stock, warehouses, sales, customers, purchases, suppliers,
//            hotel, staff, assets, expenses, roles, currencies, settings,
//            reports, users
// Actions:   view, create, edit, delete, approve, export

export const ALL_PERMISSIONS: string[] = [
  // Products & Inventory
  'products:view', 'products:create', 'products:edit', 'products:delete', 'products:export',
  'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
  'brands:view', 'brands:create', 'brands:edit', 'brands:delete',
  'units:view', 'units:create', 'units:edit', 'units:delete',
  'variations:view', 'variations:create', 'variations:edit', 'variations:delete',
  // Stock & Warehouses
  'stock:view', 'stock:adjust', 'stock:reconcile', 'stock:transfer', 'stock:export',
  'warehouses:view', 'warehouses:create', 'warehouses:edit', 'warehouses:delete',
  // Sales
  'sales:view', 'sales:create', 'sales:cancel', 'sales:return', 'sales:export',
  'customers:view', 'customers:create', 'customers:edit',
  // Purchases
  'purchases:view', 'purchases:create', 'purchases:edit', 'purchases:approve', 'purchases:receive', 'purchases:export',
  'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
  // Hotel
  'hotel:view', 'hotel:create', 'hotel:checkin', 'hotel:checkout', 'hotel:cancel', 'hotel:folio',
  'hotel:housekeeping',
  // Staff & HR
  'staff:view', 'staff:create', 'staff:edit', 'staff:terminate',
  'attendance:view', 'attendance:mark',
  'leave:view', 'leave:apply', 'leave:approve',
  'payroll:view',
  // Assets & Expenses
  'assets:view', 'assets:create', 'assets:edit', 'assets:dispose',
  'expenses:view', 'expenses:create', 'expenses:approve', 'expenses:pay',
  // Config & Admin
  'roles:view', 'roles:create', 'roles:edit', 'roles:delete',
  'currencies:view', 'currencies:edit',
  'settings:view', 'settings:edit',
  'users:view', 'users:create', 'users:edit', 'users:delete',
  // Reports
  'reports:view', 'reports:export',
];

// ── Default permission sets by system role ───────────────────────────────────
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter(p => !p.startsWith('roles:')),
  manager: [
    'products:view','products:create','products:edit','products:export',
    'categories:view','brands:view','units:view','variations:view',
    'stock:view','stock:adjust','stock:reconcile','stock:transfer','stock:export',
    'warehouses:view',
    'sales:view','sales:create','sales:cancel','sales:return','sales:export',
    'customers:view','customers:create','customers:edit',
    'purchases:view','purchases:create','purchases:edit','purchases:approve','purchases:receive','purchases:export',
    'suppliers:view','suppliers:create','suppliers:edit',
    'hotel:view','hotel:create','hotel:checkin','hotel:checkout','hotel:cancel','hotel:folio','hotel:housekeeping',
    'staff:view','attendance:view','attendance:mark','leave:view','leave:approve','payroll:view',
    'assets:view','assets:edit',
    'expenses:view','expenses:create','expenses:approve',
    'reports:view','reports:export',
    'currencies:view','settings:view',
  ],
  cashier: [
    'products:view','categories:view','brands:view','units:view',
    'stock:view',
    'sales:view','sales:create','sales:return',
    'customers:view','customers:create','customers:edit',
    'hotel:view','hotel:create','hotel:checkin','hotel:checkout','hotel:folio',
    'expenses:view','expenses:create',
  ],
  warehouse_staff: [
    'products:view','products:create','products:edit',
    'categories:view','brands:view','units:view','variations:view',
    'stock:view','stock:adjust','stock:transfer',
    'warehouses:view',
    'purchases:view','purchases:receive',
    'suppliers:view',
    'assets:view',
  ],
  hotel_staff: [
    'hotel:view','hotel:create','hotel:checkin','hotel:checkout','hotel:folio','hotel:housekeeping',
    'customers:view','customers:create',
    'expenses:view','expenses:create',
  ],
  accountant: [
    'products:view','stock:view','stock:export',
    'sales:view','sales:export',
    'customers:view',
    'purchases:view','purchases:export',
    'suppliers:view',
    'expenses:view','expenses:approve','expenses:pay',
    'assets:view',
    'staff:view','payroll:view',
    'reports:view','reports:export',
    'currencies:view',
    'settings:view',
  ],
  staff: [
    'products:view',
    'stock:view',
    'sales:view',
    'expenses:view','expenses:create',
    'leave:view','leave:apply',
  ],
};

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isSystemRole: boolean;      // System roles cannot be deleted
  isActive: boolean;
  tenantId: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    name:         { type: String, required: true, trim: true, lowercase: true, maxlength: 50 },
    displayName:  { type: String, required: true, trim: true, maxlength: 100 },
    description:  { type: String, maxlength: 500 },
    permissions:  [{ type: String, enum: ALL_PERMISSIONS }],
    isSystemRole: { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true },
    tenantId:     { type: String, required: true, default: 'default', index: true },
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

roleSchema.virtual('permissionCount').get(function (this: IRole) {
  return this.permissions.length;
});

roleSchema.index({ name: 1, tenantId: 1 }, { unique: true });

const Role = mongoose.model<IRole>('Role', roleSchema);
export default Role;
