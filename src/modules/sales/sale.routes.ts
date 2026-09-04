import { Router } from "express";
import * as ctrl from "./sale.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import {
  createSaleSchema,
  updateSaleSchema,
  addPaymentSchema,
  createReturnSchema,
  createCustomerSchema,
  dailyClosingSchema,
} from "./sale.validation";
import Joi from "joi";
import { joiSchemas } from "../../shared/middleware/validate.middleware";

const router = Router();
router.use(authenticate);

type Role = "super_admin" | "admin" | "manager" | "cashier" | "accountant";
const pos: Role[] = ["super_admin", "admin", "manager", "cashier"];
const mgr: Role[] = ["super_admin", "admin", "manager"];
const acct: Role[] = ["super_admin", "admin", "manager", "accountant"];

// ── STATIC ROUTES FIRST (most specific) ─────────────────────────────────────
router.get("/stats", authorize(...acct), ctrl.getSalesStats);
router.get("/order/:orderNumber", ctrl.getSaleByOrderNumber);

// ── CUSTOMER ROUTES ─────────────────────────────────────────────────────────
// These must come BEFORE /:id routes
router.get("/customers", ctrl.getCustomers);
router.get("/customers/:id", ctrl.getCustomerById);
router.get("/customers/:id/sales", ctrl.getCustomerSales);

router.post(
  "/customers",
  authorize(...pos),
  validate(createCustomerSchema),
  ctrl.createCustomer,
);

router.put(
  "/customers/:id",
  authorize(...pos),
  validate(createCustomerSchema.fork(["name"], (s) => s.optional())),
  ctrl.updateCustomer,
);

router.patch(
  "/customers/:id/credit",
  authorize(...mgr),
  validate(
    Joi.object({
      amount: Joi.number().not(0).required(),
      notes: Joi.string().min(3).max(500).required(),
    }),
  ),
  ctrl.adjustCustomerCredit,
);

// ── DYNAMIC ROUTES (most generic) ───────────────────────────────────────────
// These must come AFTER all static routes
router.get("/", ctrl.getSales);
router.get("/:id", ctrl.getSaleById);  // Now "/customers" won't match here!

// ── Sales CRUD (other routes) ───────────────────────────────────────────────
router.post(
  "/",
  authorize(...pos),
  validate(createSaleSchema),
  ctrl.createSale,
);

router.patch(
  "/:id/pay",
  authorize(...pos),
  validate(addPaymentSchema),
  ctrl.addPayment,
);

router.patch(
  "/:id/cancel",
  authorize(...mgr),
  validate(Joi.object({ reason: Joi.string().min(3).max(500).required() })),
  ctrl.cancelSale,
);

router.post(
  "/:id/return",
  authorize(...mgr),
  validate(createReturnSchema),
  ctrl.processReturn,
);

// ── Daily Closing ───────────────────────────────────────────────────────────
router.post(
  "/closing/daily",
  authorize(...mgr),
  validate(dailyClosingSchema),
  ctrl.getDailyClosing,
);

export default router;



// import { Router } from "express";
// import * as ctrl from "./sale.controller";
// import {
//   authenticate,
//   authorize,
// } from "../../shared/middleware/auth.middleware";
// import { validate } from "../../shared/middleware/validate.middleware";
// import {
//   createSaleSchema,
//   updateSaleSchema,
//   addPaymentSchema,
//   createReturnSchema,
//   createCustomerSchema,
//   dailyClosingSchema,
// } from "./sale.validation";
// import Joi from "joi";
// import { joiSchemas } from "../../shared/middleware/validate.middleware";

// const router = Router();
// router.use(authenticate);

// type Role = "super_admin" | "admin" | "manager" | "cashier" | "accountant";
// const pos: Role[] = ["super_admin", "admin", "manager", "cashier"];
// const mgr: Role[] = ["super_admin", "admin", "manager"];
// const acct: Role[] = ["super_admin", "admin", "manager", "accountant"];

// // ── Sales CRUD ────────────────────────────────────────────────────────────────
// router.get("/stats", authorize(...acct), ctrl.getSalesStats);
// router.get("/order/:orderNumber", ctrl.getSaleByOrderNumber);
// router.get("/", ctrl.getSales);
// router.get("/:id", ctrl.getSaleById);

// router.post(
//   "/",
//   authorize(...pos),
//   validate(createSaleSchema),
//   ctrl.createSale,
// );

// router.patch(
//   "/:id/pay",
//   authorize(...pos),
//   validate(addPaymentSchema),
//   ctrl.addPayment,
// );

// router.patch(
//   "/:id/cancel",
//   authorize(...mgr),
//   validate(Joi.object({ reason: Joi.string().min(3).max(500).required() })),
//   ctrl.cancelSale,
// );

// router.post(
//   "/:id/return",
//   authorize(...mgr),
//   validate(createReturnSchema),
//   ctrl.processReturn,
// );

// // ── Daily Closing ─────────────────────────────────────────────────────────────
// router.post(
//   "/closing/daily",
//   authorize(...mgr),
//   validate(dailyClosingSchema),
//   ctrl.getDailyClosing,
// );

// // ── Customers ─────────────────────────────────────────────────────────────────
// router.get("/customers", ctrl.getCustomers);
// router.get("/customers/:id", ctrl.getCustomerById);
// router.get("/customers/:id/sales", ctrl.getCustomerSales);

// router.post(
//   "/customers",
//   authorize(...pos),
//   validate(createCustomerSchema),
//   ctrl.createCustomer,
// );

// router.put(
//   "/customers/:id",
//   authorize(...pos),
//   validate(createCustomerSchema.fork(["name"], (s) => s.optional())),
//   ctrl.updateCustomer,
// );

// router.patch(
//   "/customers/:id/credit",
//   authorize(...mgr),
//   validate(
//     Joi.object({
//       amount: Joi.number().not(0).required(),
//       notes: Joi.string().min(3).max(500).required(),
//     }),
//   ),
//   ctrl.adjustCustomerCredit,
// );

// export default router;
