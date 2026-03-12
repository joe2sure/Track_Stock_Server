import { Router } from "express";
import * as ctrl from "./product.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import {
  createProductSchema,
  updateProductSchema,
  bulkStatusSchema,
  bulkPriceSchema,
  adjustStockSchema,
  bulkDeleteSchema,
} from "./product.validation";
import { joiSchemas } from "../../shared/middleware/validate.middleware";
import Joi from "joi";

const router = Router();
router.use(authenticate);

// ── Read-only endpoints (all authenticated roles) ────────────────────────────
router.get("/search", ctrl.searchProducts);
router.get("/stats", ctrl.getProductStats);
router.get("/low-stock", ctrl.getLowStockProducts);
router.get("/expiring", ctrl.getExpiringProducts);
router.get("/barcode/:barcode", ctrl.getProductByBarcode);
router.get("/sku/:sku", ctrl.getProductBySku);
router.get("/", ctrl.getProducts);
router.get("/:id", ctrl.getProductById);

// ── Write endpoints (manager and above) ─────────────────────────────────────
const managerRoles: ("super_admin" | "admin" | "manager")[] = [
  "super_admin",
  "admin",
  "manager",
];

router.post(
  "/",
  authorize(...managerRoles),
  validate(createProductSchema),
  ctrl.createProduct,
);

router.put(
  "/:id",
  authorize(...managerRoles),
  validate(updateProductSchema),
  ctrl.updateProduct,
);

router.delete("/:id", authorize(...managerRoles), ctrl.deleteProduct);

router.post(
  "/:id/duplicate",
  authorize(...managerRoles),
  ctrl.duplicateProduct,
);

// ── Variant endpoints ────────────────────────────────────────────────────────
router.post("/:id/variants", authorize(...managerRoles), ctrl.addVariant);

router.put(
  "/:id/variants/:variantId",
  authorize(...managerRoles),
  ctrl.updateVariant,
);

router.delete(
  "/:id/variants/:variantId",
  authorize(...managerRoles),
  ctrl.deleteVariant,
);

// ── Image endpoints ──────────────────────────────────────────────────────────
router.post(
  "/:id/images",
  authorize(...managerRoles),
  validate(
    Joi.object({
      url: Joi.string().uri().required(),
      publicId: Joi.string().optional(),
      altText: Joi.string().optional(),
    }),
  ),
  ctrl.addProductImage,
);

router.delete(
  "/:id/images/:index",
  authorize(...managerRoles),
  ctrl.removeProductImage,
);

router.patch(
  "/:id/images/primary",
  authorize(...managerRoles),
  validate(Joi.object({ index: Joi.number().integer().min(0).required() })),
  ctrl.setPrimaryImage,
);

// ── Stock adjustment ─────────────────────────────────────────────────────────
router.patch(
  "/:id/adjust-stock",
  authorize("super_admin", "admin", "manager", "warehouse_staff"),
  validate(adjustStockSchema),
  ctrl.adjustStock,
);

// ── Bulk endpoints ───────────────────────────────────────────────────────────
router.patch(
  "/bulk/status",
  authorize(...managerRoles),
  validate(bulkStatusSchema),
  ctrl.bulkUpdateStatus,
);

router.patch(
  "/bulk/price",
  authorize(...managerRoles),
  validate(bulkPriceSchema),
  ctrl.bulkUpdatePrice,
);

router.delete(
  "/bulk/delete",
  authorize(...managerRoles),
  validate(bulkDeleteSchema),
  ctrl.bulkDeleteProducts,
);

// ── Import ───────────────────────────────────────────────────────────────────
router.post(
  "/import",
  authorize(...managerRoles),
  validate(
    Joi.object({
      products: Joi.array().items(Joi.object()).min(1).max(500).required(),
    }),
  ),
  ctrl.importProducts,
);

export default router;
