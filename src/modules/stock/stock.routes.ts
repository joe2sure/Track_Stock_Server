import { Router } from "express";
import * as ctrl from "./stock.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import {
  adjustStockSchema,
  createTransferSchema,
  receiveTransferSchema,
  reconcileSchema,
  rejectTransferSchema,
  cancelTransferSchema,
} from "./stock.validation";

const router = Router();
router.use(authenticate);

type Role = "super_admin" | "admin" | "manager" | "warehouse_staff";
const mgr: Role[] = ["super_admin", "admin", "manager"];
const staff: Role[] = ["super_admin", "admin", "manager", "warehouse_staff"];

// ── Dashboard & Reports ─────────────────────────────────────────────────────
router.get("/summary", ctrl.getStockSummary);
router.get("/valuation", ctrl.getInventoryValuation);
router.get("/low-stock", ctrl.getLowStockReport);

// ── Stock Levels ─────────────────────────────────────────────────────────────
router.get("/levels", ctrl.getStockLevels);
router.get("/products/:productId", ctrl.getProductStock);

// ── Adjustments ──────────────────────────────────────────────────────────────
router.post(
  "/adjust",
  authorize(...staff),
  validate(adjustStockSchema),
  ctrl.adjustStock,
);
router.post(
  "/reconcile",
  authorize(...mgr),
  validate(reconcileSchema),
  ctrl.reconcileStock,
);

// ── Movement history ─────────────────────────────────────────────────────────
router.get("/movements", ctrl.getMovements);

// ── Transfers ────────────────────────────────────────────────────────────────
router.get("/transfers", ctrl.getTransfers);
router.get("/transfers/:id", ctrl.getTransferById);
router.post(
  "/transfers",
  authorize(...staff),
  validate(createTransferSchema),
  ctrl.createTransfer,
);
router.patch("/transfers/:id/approve", authorize(...mgr), ctrl.approveTransfer);
router.patch(
  "/transfers/:id/reject",
  authorize(...mgr),
  validate(rejectTransferSchema),
  ctrl.rejectTransfer,
);
router.patch(
  "/transfers/:id/dispatch",
  authorize(...staff),
  ctrl.dispatchTransfer,
);
router.patch(
  "/transfers/:id/receive",
  authorize(...staff),
  validate(receiveTransferSchema),
  ctrl.receiveTransfer,
);
router.patch(
  "/transfers/:id/cancel",
  authorize(...mgr),
  validate(cancelTransferSchema),
  ctrl.cancelTransfer,
);

export default router;
