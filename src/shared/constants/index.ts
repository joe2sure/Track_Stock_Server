// ── Role Definitions ────────────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN:     'super_admin',
  ADMIN:           'admin',
  MANAGER:         'manager',
  CASHIER:         'cashier',
  WAREHOUSE_STAFF: 'warehouse_staff',
  HOTEL_STAFF:     'hotel_staff',
  ACCOUNTANT:      'accountant',
  STAFF:           'staff',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// ── Permissions ──────────────────────────────────────────────────────────────
export const PERMISSIONS = {
  // Auth
  AUTH_LOGIN:     'auth:login',
  AUTH_LOGOUT:    'auth:logout',

  // Users
  USERS_READ:     'users:read',
  USERS_CREATE:   'users:create',
  USERS_UPDATE:   'users:update',
  USERS_DELETE:   'users:delete',
  USERS_MANAGE:   'users:manage',

  // Products
  PRODUCTS_READ:          'products:read',
  PRODUCTS_CREATE:        'products:create',
  PRODUCTS_UPDATE:        'products:update',
  PRODUCTS_DELETE:        'products:delete',
  PRODUCTS_IMPORT_EXPORT: 'products:import_export',

  // Stock
  STOCK_READ:     'stock:read',
  STOCK_TRANSFER: 'stock:transfer',
  STOCK_ADJUST:   'stock:adjust',
  STOCK_VALUATION:'stock:valuation',

  // Sales / POS
  SALES_READ:           'sales:read',
  SALES_CREATE:         'sales:create',
  SALES_DISCOUNT:       'sales:discount',
  SALES_HOLD:           'sales:hold',
  SALES_REFUND:         'sales:refund',
  SALES_REPORTS:        'sales:reports',

  // Purchases
  PURCHASES_READ:    'purchases:read',
  PURCHASES_CREATE:  'purchases:create',
  PURCHASES_APPROVE: 'purchases:approve',
  PURCHASES_RECEIVE: 'purchases:receive',

  // Hotel
  HOTEL_READ:           'hotel:read',
  HOTEL_BOOKING:        'hotel:booking',
  HOTEL_CHECKIN:        'hotel:checkin',
  HOTEL_MANAGE_ROOMS:   'hotel:manage_rooms',
  HOTEL_FOLIO:          'hotel:folio',

  // Staff
  STAFF_READ:          'staff:read',
  STAFF_CREATE:        'staff:create',
  STAFF_UPDATE:        'staff:update',
  STAFF_PIN:           'staff:pin',
  STAFF_SALARIES:      'staff:salaries',

  // Assets
  ASSETS_READ:       'assets:read',
  ASSETS_CREATE:     'assets:create',
  ASSETS_UPDATE:     'assets:update',
  ASSETS_MAINTENANCE:'assets:maintenance',
  ASSETS_PURCHASE:   'assets:purchase',

  // Expenses
  EXPENSES_READ:    'expenses:read',
  EXPENSES_CREATE:  'expenses:create',
  EXPENSES_APPROVE: 'expenses:approve',
  EXPENSES_REPORTS: 'expenses:reports',

  // Reports
  REPORTS_SALES:     'reports:sales',
  REPORTS_STOCK:     'reports:stock',
  REPORTS_PURCHASES: 'reports:purchases',
  REPORTS_FINANCIAL: 'reports:financial',
  REPORTS_EXPORT:    'reports:export',

  // Settings
  SETTINGS_READ:      'settings:read',
  SETTINGS_UPDATE:    'settings:update',
  SETTINGS_ROLES:     'settings:roles',
  SETTINGS_WAREHOUSES:'settings:warehouses',
  SETTINGS_SYSTEM:    'settings:system',

  // Payments
  PAYMENTS_READ:     'payments:read',
  PAYMENTS_PROCESS:  'payments:process',
  PAYMENTS_REFUND:   'payments:refund',
} as const;

// ── Default permissions per role ─────────────────────────────────────────────
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  super_admin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS),
  manager: [
    PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_TRANSFER, PERMISSIONS.STOCK_ADJUST, PERMISSIONS.STOCK_VALUATION,
    PERMISSIONS.SALES_READ, PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_DISCOUNT, PERMISSIONS.SALES_HOLD, PERMISSIONS.SALES_REFUND, PERMISSIONS.SALES_REPORTS,
    PERMISSIONS.PURCHASES_READ, PERMISSIONS.PURCHASES_CREATE, PERMISSIONS.PURCHASES_APPROVE, PERMISSIONS.PURCHASES_RECEIVE,
    PERMISSIONS.STAFF_READ, PERMISSIONS.STAFF_UPDATE,
    PERMISSIONS.REPORTS_SALES, PERMISSIONS.REPORTS_STOCK, PERMISSIONS.REPORTS_PURCHASES,
    PERMISSIONS.SETTINGS_READ, PERMISSIONS.SETTINGS_WAREHOUSES,
    PERMISSIONS.EXPENSES_READ, PERMISSIONS.EXPENSES_CREATE, PERMISSIONS.EXPENSES_APPROVE,
    PERMISSIONS.USERS_READ,
  ],
  cashier: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.SALES_READ, PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_HOLD,
    PERMISSIONS.STOCK_READ,
  ],
  warehouse_staff: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_TRANSFER, PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.PURCHASES_READ, PERMISSIONS.PURCHASES_RECEIVE,
  ],
  hotel_staff: [
    PERMISSIONS.HOTEL_READ, PERMISSIONS.HOTEL_BOOKING, PERMISSIONS.HOTEL_CHECKIN, PERMISSIONS.HOTEL_FOLIO,
    PERMISSIONS.PRODUCTS_READ,
  ],
  accountant: [
    PERMISSIONS.REPORTS_SALES, PERMISSIONS.REPORTS_STOCK, PERMISSIONS.REPORTS_PURCHASES, PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.EXPENSES_READ, PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.PURCHASES_READ,
    PERMISSIONS.PAYMENTS_READ,
  ],
  staff: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.STOCK_READ,
  ],
};

// ── HTTP Status Codes ─────────────────────────────────────────────────────────
export const HTTP_STATUS = {
  OK:                     200,
  CREATED:                201,
  NO_CONTENT:             204,
  BAD_REQUEST:            400,
  UNAUTHORIZED:           401,
  PAYMENT_REQUIRED:       402,
  FORBIDDEN:              403,
  NOT_FOUND:              404,
  CONFLICT:               409,
  UNPROCESSABLE_ENTITY:   422,
  TOO_MANY_REQUESTS:      429,
  INTERNAL_SERVER_ERROR:  500,
  SERVICE_UNAVAILABLE:    503,
} as const;

// ── Business Constants ─────────────────────────────────────────────────────────
export const BUSINESS = {
  DEFAULT_TAX_RATE:           7.5,
  DEFAULT_LOW_STOCK_THRESHOLD: 10,
  DEFAULT_CURRENCY:           'NGN',
  DEFAULT_TIMEZONE:           'Africa/Lagos',
  MAX_DISCOUNT_PERCENT:       100,
  MAX_HOLD_DAYS:              7,
  RECEIPT_PREFIX:             'RCP',
  ORDER_PREFIX:               'SO',
  PURCHASE_PREFIX:            'PO',
  BOOKING_PREFIX:             'BKG',
  EXPENSE_PREFIX:             'EXP',
  ASSET_PREFIX:               'AST',
} as const;

// ── File size limits ─────────────────────────────────────────────────────────
export const FILE_LIMITS = {
  IMAGE_MAX_MB:    5,
  DOCUMENT_MAX_MB: 10,
  IMPORT_MAX_MB:   20,
  AVATAR_MAX_MB:   2,
} as const;

// ── Pagination defaults ───────────────────────────────────────────────────────
export const PAGINATION = {
  DEFAULT_PAGE:  1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT:     100,
} as const;
