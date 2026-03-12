import { Router } from "express";
import * as ctrl from "./purchase.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import {
  createPOSchema,
  updatePOSchema,
  addPaymentSchema,
  createGRNSchema,
  createReturnSchema,
  creditNoteSchema,
} from "./purchase.validation";
import Joi from "joi";

const router = Router();
router.use(authenticate);

type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "warehouse_staff"
  | "accountant";
const mgr: Role[] = ["super_admin", "admin", "manager"];
const staff: Role[] = ["super_admin", "admin", "manager", "warehouse_staff"];
const acct: Role[] = ["super_admin", "admin", "manager", "accountant"];

const cancelSchema = Joi.object({
  reason: Joi.string().min(3).max(500).required(),
});

// ── Purchase Orders ──────────────────────────────────────────────────────────
router.get("/stats", authorize(...acct), ctrl.getPurchaseStats);
router.get("/", ctrl.getPOs);
router.get("/:id", ctrl.getPOById);

router.post("/", authorize(...mgr), validate(createPOSchema), ctrl.createPO);
router.put("/:id", authorize(...mgr), validate(updatePOSchema), ctrl.updatePO);
router.patch("/:id/send", authorize(...mgr), ctrl.sendPO);
router.patch("/:id/approve", authorize(...mgr), ctrl.approvePO);
router.patch(
  "/:id/cancel",
  authorize(...mgr),
  validate(cancelSchema),
  ctrl.cancelPO,
);
router.post(
  "/:id/payments",
  authorize(...acct),
  validate(addPaymentSchema),
  ctrl.addPaymentToPO,
);

// ── Goods Receipt Notes ──────────────────────────────────────────────────────
router.get("/grns", ctrl.getGRNs);
router.get("/grns/:id", ctrl.getGRNById);
router.post(
  "/grns",
  authorize(...staff),
  validate(createGRNSchema),
  ctrl.createGRN,
);

// ── Purchase Returns ─────────────────────────────────────────────────────────
router.get("/returns", ctrl.getPurchaseReturns);
router.post(
  "/returns",
  authorize(...mgr),
  validate(createReturnSchema),
  ctrl.createPurchaseReturn,
);
router.patch(
  "/returns/:id/credit",
  authorize(...acct),
  validate(creditNoteSchema),
  ctrl.recordCreditNote,
);

export default router;
