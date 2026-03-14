import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';

import env from './config/env';
import swaggerSpec from './config/swagger';
import { httpLogger, requestId, responseTime } from './shared/middleware/logger.middleware';
import { globalRateLimiter } from './shared/middleware/rateLimiter.middleware';
import { globalErrorHandler, notFoundHandler } from './shared/middleware/error.middleware';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes      from './modules/auth/auth.routes';
import userRoutes      from './modules/users/user.routes';
import productRoutes   from './modules/products/product.routes';
import categoryRoutes  from './modules/categories/category.routes';
import brandRoutes     from './modules/brands/brand.routes';
import unitRoutes      from './modules/units/unit.routes';
import variationRoutes from './modules/variations/variation.routes';

import stockRoutes      from './modules/stock/stock.routes';
import warehouseRoutes  from './modules/warehouses/warehouse.routes';
import saleRoutes       from './modules/sales/sale.routes';
import purchaseRoutes   from './modules/purchases/purchase.routes';
import supplierRoutes   from './modules/suppliers/supplier.routes';
import hotelRoutes      from './modules/hotel/hotel.routes';
import staffRoutes      from './modules/staff/staff.routes';
import assetRoutes      from './modules/assets/asset.routes';
import expenseRoutes    from './modules/expenses/expense.routes';
import roleRoutes       from './modules/roles/role.routes';
import currencyRoutes   from './modules/currencies/currency.routes';
import settingsRoutes   from './modules/settings/settings.routes';
import reportRoutes     from './modules/reports/report.routes';
import notifRoutes      from './modules/notifications/notifications.routes';
import paymentRoutes    from './modules/payments/payment.routes';
import mediaRoutes      from './modules/media/media.routes';

function createApp(): Application {
  const app = express();

  // ── Trust proxy (for accurate IP behind load balancer) ────────────────────
  app.set('trust proxy', 1);

  // ── Security headers (Helmet) ─────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        scriptSrc:  ["'self'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Swagger UI needs this
    referrerPolicy: { policy: 'same-origin' },
  }));

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGINS.includes(origin) || env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders:   ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders:   ['X-Request-ID', 'X-Response-Time', 'X-RateLimit-Remaining'],
    credentials:      true,
    maxAge:           86400, // 24h preflight cache
  }));

  // ── Compression ───────────────────────────────────────────────────────────
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
    level: 6,
  }));

  // ── Body parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // ── Security middleware ────────────────────────────────────────────────────
  // Custom MongoDB injection sanitizer — strips $ and . keys from all inputs.
  // express-mongo-sanitize v2 tries to reassign req.query which is a read-only
  // getter in newer Express/Node versions. This implementation mutates values
  // in place so it works with any Express version.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const FORBIDDEN = /[$.]|^\$/;

    function sanitize(obj: unknown): unknown {
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      if (obj !== null && typeof obj === 'object') {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (FORBIDDEN.test(k)) {
            // Drop the key entirely — log in dev only
            if (env.NODE_ENV === 'development') {
              console.warn(`[Sanitize] Blocked key: "${k}"`);
            }
          } else {
            clean[k] = sanitize(v);
          }
        }
        return clean;
      }
      if (typeof obj === 'string') {
        // Strip leading $ from string values too
        return obj.replace(/^\$/, '_');
      }
      return obj;
    }

    // body and params can be reassigned safely
    if (req.body   && typeof req.body   === 'object') req.body   = sanitize(req.body);
    if (req.params && typeof req.params === 'object') req.params = sanitize(req.params) as typeof req.params;

    // req.query is read-only in newer Express — mutate individual properties
    if (req.query && typeof req.query === 'object') {
      const sanitized = sanitize(req.query) as Record<string, unknown>;
      for (const key of Object.keys(req.query)) {
        try { delete (req.query as Record<string, unknown>)[key]; } catch { /* non-configurable */ }
      }
      Object.assign(req.query, sanitized);
    }

    next();
  });

  app.use(hpp({
    whitelist: ['tags', 'categories', 'status', 'ids'],
  }));

  // ── Request middleware ─────────────────────────────────────────────────────
  app.use(requestId);
  app.use(responseTime);
  app.use(httpLogger);

  // ── Global rate limiter ────────────────────────────────────────────────────
  app.use(globalRateLimiter);

  // ── Health check ──────────────────────────────────────────────────────────
  /**
   * @swagger
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: API health check
   *     security: []
   *     responses:
   *       200:
   *         description: API is healthy
   */
  app.get('/health', (_req: Request, res: Response) => {
    const { getCacheStats } = require('./shared/utils/cache');
    const cache = getCacheStats();
    res.status(200).json({
      success:    true,
      status:     'healthy',
      service:    'trackstock-inventory-api',
      version:    '1.0.0',
      env:        env.NODE_ENV,
      timestamp:  new Date().toISOString(),
      uptime:     `${Math.floor(process.uptime())}s`,
      cache: {
        mode:       cache.mode,
        redisReady: cache.redisReady,
        redisUrl:   cache.redisUrl,
      },
    });
  });

  app.get(`/api/${env.API_VERSION}/health`, (_req: Request, res: Response) => {
    const { getCacheStats } = require('./shared/utils/cache');
    const cache = getCacheStats();
    res.status(200).json({
      success:    true,
      status:     'healthy',
      service:    'trackstock-inventory-api',
      version:    '1.0.0',
      env:        env.NODE_ENV,
      timestamp:  new Date().toISOString(),
      uptime:     `${Math.floor(process.uptime())}s`,
      cache: {
        mode:       cache.mode,
        redisReady: cache.redisReady,
        redisUrl:   cache.redisUrl,
      },
    });
  });

  // ── Swagger Documentation ──────────────────────────────────────────────────
  const swaggerOptions: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'TrackStock API Docs',
    customfavIcon:   '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { background: linear-gradient(135deg, #2563eb, #1d4ed8); }
      .swagger-ui .info .title { color: #1d4ed8; }
    `,
  };

  app.use(
    `/api/${env.API_VERSION}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerOptions)
  );

  // Expose raw swagger JSON
  app.get(`/api/${env.API_VERSION}/docs.json`, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // ── API Routes ─────────────────────────────────────────────────────────────
  const apiRouter = express.Router();
  const V = env.API_VERSION;

  app.use(`/api/${V}/auth`,       authRoutes);
  app.use(`/api/${V}/users`,      userRoutes);
  app.use(`/api/${V}/products`,   productRoutes);
  app.use(`/api/${V}/categories`, categoryRoutes);
  app.use(`/api/${V}/brands`,     brandRoutes);
  app.use(`/api/${V}/units`,      unitRoutes);
  app.use(`/api/${V}/variations`,  variationRoutes);
  app.use(`/api/${V}/stock`,       stockRoutes);
  app.use(`/api/${V}/warehouses`,  warehouseRoutes);
  app.use(`/api/${V}/sales`,       saleRoutes);
  app.use(`/api/${V}/purchases`,   purchaseRoutes);
  app.use(`/api/${V}/suppliers`,   supplierRoutes);
  app.use(`/api/${V}/hotel`,       hotelRoutes);
  app.use(`/api/${V}/staff`,       staffRoutes);
  app.use(`/api/${V}/assets`,      assetRoutes);
  app.use(`/api/${V}/expenses`,    expenseRoutes);
  app.use(`/api/${V}/roles`,       roleRoutes);
  app.use(`/api/${V}/currencies`,  currencyRoutes);
  app.use(`/api/${V}/settings`,      settingsRoutes);
  app.use(`/api/${V}/reports`,       reportRoutes);
  app.use(`/api/${V}/notifications`, notifRoutes);
  app.use(`/api/${V}/payments`,      paymentRoutes);
  app.use(`/api/${V}/media`,         mediaRoutes);

  // Phase 10+ routes mounted here

  // app.use(`/api/${V}/notifications`, notificationRoutes);

  // ── API root info ─────────────────────────────────────────────────────────
  app.get(`/api/${V}`, (_req: Request, res: Response) => {
    res.json({
      success: true,
      name:    'TrackStock Inventory Management API',
      version: '1.0.0',
      docs:    `${env.API_BASE_URL}/api/${V}/docs`,
      health:  `${env.API_BASE_URL}/api/${V}/health`,
      endpoints: {
        auth:          `/api/${V}/auth`,
        users:         `/api/${V}/users`,
        products:      `/api/${V}/products`,
        categories:    `/api/${V}/categories`,
        stock:         `/api/${V}/stock`,
        sales:         `/api/${V}/sales`,
        purchases:     `/api/${V}/purchases`,
        hotel:         `/api/${V}/hotel`,
        staff:         `/api/${V}/staff`,
        assets:        `/api/${V}/assets`,
        expenses:      `/api/${V}/expenses`,
        suppliers:     `/api/${V}/suppliers`,
        warehouses:    `/api/${V}/warehouses`,
        roles:         `/api/${V}/roles`,
        currencies:    `/api/${V}/currencies`,
        settings:      `/api/${V}/settings`,
        reports:       `/api/${V}/reports`,
        payments:      `/api/${V}/payments`,
        media:         `/api/${V}/media`,
        notifications: `/api/${V}/notifications`,
      },
    });
  });

  void apiRouter; // referenced in comments above, suppress unused warning

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}

export default createApp;





// import express, { Application, Request, Response } from "express";
// import helmet from "helmet";
// import cors from "cors";
// import compression from "compression";
// import cookieParser from "cookie-parser";
// import mongoSanitize from "express-mongo-sanitize";
// import hpp from "hpp";
// import swaggerUi from "swagger-ui-express";

// import env from "./config/env";
// import swaggerSpec from "./config/swagger";
// import {
//   httpLogger,
//   requestId,
//   responseTime,
// } from "./shared/middleware/logger.middleware";
// import { globalRateLimiter } from "./shared/middleware/rateLimiter.middleware";
// import {
//   globalErrorHandler,
//   notFoundHandler,
// } from "./shared/middleware/error.middleware";

// // ── Route imports ─────────────────────────────────────────────────────────────
// import authRoutes from "./modules/auth/auth.routes";
// import userRoutes from "./modules/users/user.routes";
// import productRoutes from "./modules/products/product.routes";
// import categoryRoutes from "./modules/categories/category.routes";
// import brandRoutes from "./modules/brands/brand.routes";
// import unitRoutes from "./modules/units/unit.routes";
// import variationRoutes from "./modules/variations/variation.routes";

// import stockRoutes from "./modules/stock/stock.routes";
// import warehouseRoutes from "./modules/warehouses/warehouse.routes";
// import saleRoutes from "./modules/sales/sale.routes";
// import purchaseRoutes from "./modules/purchases/purchase.routes";
// import supplierRoutes from "./modules/suppliers/supplier.routes";
// import hotelRoutes from "./modules/hotel/hotel.routes";
// import staffRoutes from "./modules/staff/staff.routes";
// import assetRoutes from "./modules/assets/asset.routes";
// import expenseRoutes from "./modules/expenses/expense.routes";
// import roleRoutes from "./modules/roles/role.routes";
// import currencyRoutes from "./modules/currencies/currency.routes";
// import settingsRoutes from "./modules/settings/settings.routes";
// import reportRoutes from "./modules/reports/report.routes";
// import notifRoutes from "./modules/notifications/notifications.routes";
// import paymentRoutes from "./modules/payments/payment.routes";
// import mediaRoutes from "./modules/media/media.routes";

// function createApp(): Application {
//   const app = express();

//   // ── Trust proxy (for accurate IP behind load balancer) ────────────────────
//   app.set("trust proxy", 1);

//   // ── Security headers (Helmet) ─────────────────────────────────────────────
//   app.use(
//     helmet({
//       contentSecurityPolicy: {
//         directives: {
//           defaultSrc: ["'self'"],
//           styleSrc: ["'self'", "'unsafe-inline'"],
//           scriptSrc: ["'self'"],
//           imgSrc: ["'self'", "data:", "https:"],
//         },
//       },
//       crossOriginEmbedderPolicy: false, // Swagger UI needs this
//       referrerPolicy: { policy: "same-origin" },
//     }),
//   );

//   // ── CORS ──────────────────────────────────────────────────────────────────
//   app.use(
//     cors({
//       origin: (origin, callback) => {
//         // Allow requests with no origin (mobile apps, curl, Postman)
//         if (!origin) return callback(null, true);
//         if (
//           env.CORS_ORIGINS.includes(origin) ||
//           env.NODE_ENV === "development"
//         ) {
//           return callback(null, true);
//         }
//         return callback(new Error(`CORS: Origin ${origin} not allowed`));
//       },
//       methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//       allowedHeaders: [
//         "Content-Type",
//         "Authorization",
//         "X-Request-ID",
//         "X-API-Key",
//       ],
//       exposedHeaders: [
//         "X-Request-ID",
//         "X-Response-Time",
//         "X-RateLimit-Remaining",
//       ],
//       credentials: true,
//       maxAge: 86400, // 24h preflight cache
//     }),
//   );

//   // ── Compression ───────────────────────────────────────────────────────────
//   app.use(
//     compression({
//       filter: (req, res) => {
//         if (req.headers["x-no-compression"]) return false;
//         return compression.filter(req, res);
//       },
//       level: 6,
//     }),
//   );

//   // ── Body parsers ──────────────────────────────────────────────────────────
//   app.use(express.json({ limit: "10mb" }));
//   app.use(express.urlencoded({ extended: true, limit: "10mb" }));
//   app.use(cookieParser(env.COOKIE_SECRET));

//   // ── Security middleware ────────────────────────────────────────────────────
//   app.use(
//     mongoSanitize({
//       replaceWith: "_",
//       onSanitize: ({ key }) => {
//         console.warn(`Sanitized key: ${key}`);
//       },
//     }),
//   );

//   app.use(
//     hpp({
//       whitelist: ["tags", "categories", "status", "ids"],
//     }),
//   );

//   // ── Request middleware ─────────────────────────────────────────────────────
//   app.use(requestId);
//   app.use(responseTime);
//   app.use(httpLogger);

//   // ── Global rate limiter ────────────────────────────────────────────────────
//   app.use(globalRateLimiter);

//   // ── Health check ──────────────────────────────────────────────────────────
//   /**
//    * @swagger
//    * /health:
//    *   get:
//    *     tags: [Health]
//    *     summary: API health check
//    *     security: []
//    *     responses:
//    *       200:
//    *         description: API is healthy
//    */
//   app.get("/health", (_req: Request, res: Response) => {
//     res.status(200).json({
//       success: true,
//       status: "healthy",
//       service: "ebeano-inventory-api",
//       version: "1.0.0",
//       env: env.NODE_ENV,
//       timestamp: new Date().toISOString(),
//       uptime: `${Math.floor(process.uptime())}s`,
//     });
//   });

//   app.get(`/api/${env.API_VERSION}/health`, (_req: Request, res: Response) => {
//     res.status(200).json({
//       success: true,
//       status: "healthy",
//       service: "ebeano-inventory-api",
//       version: "1.0.0",
//       env: env.NODE_ENV,
//       timestamp: new Date().toISOString(),
//       uptime: `${Math.floor(process.uptime())}s`,
//     });
//   });

//   // ── Swagger Documentation ──────────────────────────────────────────────────
//   const swaggerOptions: swaggerUi.SwaggerUiOptions = {
//     customSiteTitle: "Ebeano API Docs",
//     customfavIcon: "/favicon.ico",
//     swaggerOptions: {
//       persistAuthorization: true,
//       displayRequestDuration: true,
//       filter: true,
//       tryItOutEnabled: true,
//     },
//     customCss: `
//       .swagger-ui .topbar { background: linear-gradient(135deg, #2563eb, #1d4ed8); }
//       .swagger-ui .info .title { color: #1d4ed8; }
//     `,
//   };

//   app.use(
//     `/api/${env.API_VERSION}/docs`,
//     swaggerUi.serve,
//     swaggerUi.setup(swaggerSpec, swaggerOptions),
//   );

//   // Expose raw swagger JSON
//   app.get(
//     `/api/${env.API_VERSION}/docs.json`,
//     (_req: Request, res: Response) => {
//       res.setHeader("Content-Type", "application/json");
//       res.send(swaggerSpec);
//     },
//   );

//   // ── API Routes ─────────────────────────────────────────────────────────────
//   const apiRouter = express.Router();
//   const V = env.API_VERSION;

//   app.use(`/api/${V}/auth`, authRoutes);
//   app.use(`/api/${V}/users`, userRoutes);
//   app.use(`/api/${V}/products`, productRoutes);
//   app.use(`/api/${V}/categories`, categoryRoutes);
//   app.use(`/api/${V}/brands`, brandRoutes);
//   app.use(`/api/${V}/units`, unitRoutes);
//   app.use(`/api/${V}/variations`, variationRoutes);
//   app.use(`/api/${V}/stock`, stockRoutes);
//   app.use(`/api/${V}/warehouses`, warehouseRoutes);
//   app.use(`/api/${V}/sales`, saleRoutes);
//   app.use(`/api/${V}/purchases`, purchaseRoutes);
//   app.use(`/api/${V}/suppliers`, supplierRoutes);
//   app.use(`/api/${V}/hotel`, hotelRoutes);
//   app.use(`/api/${V}/staff`, staffRoutes);
//   app.use(`/api/${V}/assets`, assetRoutes);
//   app.use(`/api/${V}/expenses`, expenseRoutes);
//   app.use(`/api/${V}/roles`, roleRoutes);
//   app.use(`/api/${V}/currencies`, currencyRoutes);
//   app.use(`/api/${V}/settings`, settingsRoutes);
//   app.use(`/api/${V}/reports`, reportRoutes);
//   app.use(`/api/${V}/notifications`, notifRoutes);
//   app.use(`/api/${V}/payments`, paymentRoutes);
//   app.use(`/api/${V}/media`, mediaRoutes);

//   // Phase 10+ routes mounted here

//   // app.use(`/api/${V}/notifications`, notificationRoutes);

//   // ── API root info ─────────────────────────────────────────────────────────
//   app.get(`/api/${V}`, (_req: Request, res: Response) => {
//     res.json({
//       success: true,
//       name: "Ebeano Inventory Management API",
//       version: "1.0.0",
//       docs: `${env.API_BASE_URL}/api/${V}/docs`,
//       health: `${env.API_BASE_URL}/api/${V}/health`,
//       endpoints: {
//         auth: `/api/${V}/auth`,
//         users: `/api/${V}/users`,
//         products: `/api/${V}/products`,
//         categories: `/api/${V}/categories`,
//         stock: `/api/${V}/stock`,
//         sales: `/api/${V}/sales`,
//         purchases: `/api/${V}/purchases`,
//         hotel: `/api/${V}/hotel`,
//         staff: `/api/${V}/staff`,
//         assets: `/api/${V}/assets`,
//         expenses: `/api/${V}/expenses`,
//         suppliers: `/api/${V}/suppliers`,
//         warehouses: `/api/${V}/warehouses`,
//         roles: `/api/${V}/roles`,
//         currencies: `/api/${V}/currencies`,
//         settings: `/api/${V}/settings`,
//         reports: `/api/${V}/reports`,
//         payments: `/api/${V}/payments`,
//         media: `/api/${V}/media`,
//         notifications: `/api/${V}/notifications`,
//       },
//     });
//   });

//   void apiRouter; // referenced in comments above, suppress unused warning

//   // ── 404 handler ───────────────────────────────────────────────────────────
//   app.use(notFoundHandler);

//   // ── Global error handler (must be last) ───────────────────────────────────
//   app.use(globalErrorHandler);

//   return app;
// }

// export default createApp;