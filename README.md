# 🏪 TrackStock Inventory Management API

A production-ready Node.js/TypeScript REST API powering the **TrackStock AI-Integrated Inventory Management System** — a full-stack platform covering retail POS, inventory, procurement, hotel operations, HR, and financial reporting.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Modules](#api-modules)
- [Authentication](#authentication)
- [WebSocket Events](#websocket-events)
- [Seeded Test Data](#seeded-test-data)
- [Deployment](#deployment)

---

## Overview

| Stat | Value |
|------|-------|
| Language | TypeScript (strict mode) |
| Files | 133 source files |
| Lines of code | ~18,500 |
| API Modules | 23 |
| Endpoints | ~190 |
| Database | MongoDB Atlas (Mongoose 8) |

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | MongoDB Atlas via Mongoose 8 |
| Auth | JWT (access + refresh token rotation) |
| Email | SendGrid |
| SMS / WhatsApp | Twilio |
| Payments | Paystack |
| Media | Cloudinary |
| Real-time | Socket.IO |
| Scheduler | node-cron |
| Docs | Swagger / OpenAPI 3.0 |
| Security | Helmet, CORS, express-rate-limit |
| Validation | Joi |
| Logging | Winston |
| Cache | NodeCache (in-memory) |

---

## Project Structure

```
src/
├── config/
│   ├── database.ts        # MongoDB connection
│   ├── env.ts             # Validated environment variables
│   ├── logger.ts          # Winston logger
│   └── swagger.ts         # OpenAPI 3.0 spec + component schemas
├── modules/
│   ├── auth/              # JWT auth, OTP, sessions
│   ├── users/             # User management
│   ├── products/          # Product catalog (simple/variable/bundle/service)
│   ├── categories/        # Hierarchical categories
│   ├── brands/            # Product brands
│   ├── units/             # Units of measurement
│   ├── variations/        # Product attributes & options
│   ├── stock/             # Stock levels, movements, transfers
│   ├── warehouses/        # Warehouse management
│   ├── sales/             # POS, invoices, quotations, customers
│   ├── purchases/         # Purchase orders, GRN, returns
│   ├── suppliers/         # Supplier management
│   ├── hotel/             # Rooms, bookings, folio, housekeeping
│   ├── staff/             # HR, attendance, leave, payroll
│   ├── assets/            # Asset registry, depreciation, maintenance
│   ├── expenses/          # Expense management & approval workflow
│   ├── roles/             # RBAC — 60 permissions across 20 resources
│   ├── currencies/        # Multi-currency with exchange rates
│   ├── settings/          # Business configuration
│   ├── reports/           # Analytics (P&L, sales, stock, hotel, expenses)
│   ├── payments/          # Paystack integration
│   ├── media/             # Cloudinary uploads
│   └── notifications/     # Email, SMS, WebSocket, scheduler
├── shared/
│   ├── middleware/        # auth, validate, error, logger, rateLimiter
│   ├── types/             # Shared TypeScript types
│   └── utils/             # cache, errors, jwt, pagination, password, response
├── scripts/
│   └── seed.ts            # Database seeder
├── app.ts                 # Express app factory
└── server.ts              # HTTP + Socket.IO server
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env — at minimum set MONGODB_URI and JWT secrets

# 3. Seed the database with test data
npm run seed

# 4. Start development server
npm run dev
```

The server starts at **http://localhost:5000**

**Swagger UI:** http://localhost:5000/api/v1/docs

---

## Environment Variables

See [`.env.example`](.env.example) for all variables with descriptions.

**Required for basic operation:**
```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
```

**Required for full feature set:**
```
SENDGRID_API_KEY        # Email notifications
TWILIO_ACCOUNT_SID      # SMS alerts
TWILIO_AUTH_TOKEN
CLOUDINARY_CLOUD_NAME   # Media uploads
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
PAYSTACK_SECRET_KEY     # Payment processing
PAYSTACK_WEBHOOK_SECRET
```

> All third-party services degrade gracefully when not configured — the API logs a warning and skips the operation rather than crashing.

---

## API Modules

Base URL: `http://localhost:5000/api/v1`

| Module | Route Prefix | Key Endpoints |
|---|---|---|
| Auth | `/auth` | register, login, refresh, logout, forgot-password, verify-email |
| Users | `/users` | CRUD, role assignment, deactivation |
| Products | `/products` | CRUD, SKU lookup, variants, stats |
| Categories | `/categories` | CRUD, tree view |
| Brands | `/brands` | CRUD |
| Units | `/units` | CRUD, 14 seeded defaults |
| Variations | `/variations` | CRUD, attribute management |
| Warehouses | `/warehouses` | CRUD, default flag |
| Stock | `/stock` | levels, adjustments, transfers, movements, valuation |
| Sales | `/sales` | POS, invoices, quotations, payments, returns, Z-report |
| Purchases | `/purchases` | PO lifecycle, GRN, payments, returns |
| Suppliers | `/suppliers` | CRUD, stats, credit tracking |
| Hotel | `/hotel` | room types, rooms, bookings, check-in/out, folio, housekeeping |
| Staff | `/staff` | HR records, attendance, leave requests, payroll summary |
| Assets | `/assets` | registry, depreciation, maintenance, disposal |
| Expenses | `/expenses` | submission → approval → payment workflow |
| Roles | `/roles` | CRUD, permission registry, clone, seed |
| Currencies | `/currencies` | CRUD, exchange rate updates, conversion |
| Settings | `/settings` | section-aware config, bootstrap, invoice counter |
| Reports | `/reports` | overview, P&L, sales, stock valuation, purchases, hotel, expenses |
| Payments | `/payments` | Paystack initialize, verify, webhook |
| Media | `/media` | Cloudinary upload for products, staff, assets, expenses, logo |
| Notifications | `/notifications` | manual triggers, WebSocket event reference, broadcast |

---

## Authentication

All endpoints (except `/auth/*`, `/payments/paystack/webhook`, and health check) require a Bearer JWT:

```http
Authorization: Bearer <access_token>
```

**Token lifecycle:**
- Access token expires in **15 minutes**
- Refresh token expires in **7 days**
- Call `POST /auth/refresh` with the refresh token to get a new access token
- Refresh tokens rotate on every use (old token is invalidated)

**Roles (8 system roles, all seeded):**

| Role | Key Permissions |
|---|---|
| `super_admin` | All 60 permissions |
| `admin` | All except role management |
| `manager` | Full operational access + reporting |
| `cashier` | POS, hotel front desk, basic expenses |
| `warehouse_staff` | Stock, products, GRN receiving |
| `hotel_staff` | Hotel operations, housekeeping |
| `accountant` | Financial reports, expense approval, payroll view |
| `staff` | View-only + personal expense submission |

Custom roles can be created via `POST /roles` with any combination of the 60 available permissions.

---

## WebSocket Events

Connect using Socket.IO:

```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'Bearer <access_token>' }
});

// Join your tenant room to receive events
socket.emit('join_room', 'tenant:default');

// Listen for events
socket.on('low_stock_alert',   (data) => console.log(data));
socket.on('new_sale',          (data) => console.log(data));
socket.on('hotel_checkin',     (data) => console.log(data));
socket.on('overdue_checkouts', (data) => console.log(data));
socket.on('expense_submitted', (data) => console.log(data));
```

**Full event reference:** `GET /api/v1/notifications/events`

---

## Seeded Test Data

Run `npm run seed` to populate:

### Users

| Role | Email | Password |
|---|---|---|
| super_admin | 247okolo@gmail.com | spotenugu123 |
| manager | manager@TrackStock.com | Manager@123 |
| cashier | cashier@TrackStock.com | Cashier@123 |
| warehouse_staff | warehouse@TrackStock.com | Warehouse@123 |
| hotel_staff | hotel@TrackStock.com | Hotel@123 |
| accountant | accounts@TrackStock.com | Accounts@123 |

### Other Seed Data
- **3 warehouses** — Main Store (MAIN), Warehouse B (WHB), Abuja Branch (ABJ)
- **5 customers** — Emeka Okafor, Fatima Abdullahi, Chidinma Stores, Bello Traders, Ngozi Eze
- **5 suppliers** — Dangote Industries, UAC Foods, Chi Limited, Honeywell Flour Mills, Lagos Fresh Distributors
- **4 hotel room types** — Standard (₦15k), Deluxe (₦25k), Executive Suite (₦45k), Family (₦35k)
- **10 hotel rooms** — Floors 1–3 (101–104, 201–204, 301–302)
- **6 staff members** — EMP-0001 to EMP-0006 across Sales, Accounts, Warehouse, Hotel, Administration
- **8 system roles** — with pre-configured permission sets
- **8 currencies** — NGN (base), USD, GBP, EUR, GHS, XOF, KES, ZAR
- **Business settings** — TrackStock Supermarket & Hotel, Enugu, VAT 7.5%

---

## Scheduled Jobs

| Job | Schedule | Action |
|---|---|---|
| Daily sales summary | 08:00 WAT daily | Emails yesterday's summary to all managers |
| Low-stock alerts | 07:00 WAT daily | Email + SMS for products below min stock level |
| Depreciation refresh | Sunday 02:00 WAT | Recalculates asset current values |
| Overdue checkout alerts | 12:00 WAT daily | WebSocket alert for guests past checkout time |

Manual triggers available via `POST /api/v1/notifications/trigger/*`

---

## Deployment

### Build for production

```bash
npm run build
npm start
```

### Environment
Set `NODE_ENV=production` and ensure all required env vars are set.

### Paystack Webhook
Register your webhook URL in the Paystack dashboard:
```
https://yourdomain.com/api/v1/payments/paystack/webhook
```

### MongoDB Indexes
Indexes are created automatically by Mongoose on first connection. For production, consider running the seed script once then disabling it.

---

## Scripts

```bash
npm run dev      # Start with nodemon hot-reload
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled production build
npm run seed     # Seed database with test data
npm run lint     # ESLint
npm run format   # Prettier
```

---

*Built with ❤️ for TrackStock Supermarket & Hotel, Enugu, Nigeria*
