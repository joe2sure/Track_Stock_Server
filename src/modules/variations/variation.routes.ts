import { Router } from "express";
import * as ctrl from "./variation.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import Joi from "joi";

const router = Router();
router.use(authenticate);

const optionSchema = Joi.object({
  value: Joi.string().trim().min(1).max(100).required(),
  label: Joi.string().trim().min(1).max(100).required(),
  colorHex: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .optional(),
  sortOrder: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(60).required(),
  type: Joi.string().valid("text", "color", "image", "button").default("text"),
  options: Joi.array().items(optionSchema).default([]),
  isActive: Joi.boolean().default(true),
});

router.get("/", ctrl.getVariations);
router.get("/:id", ctrl.getVariationById);

router.post(
  "/",
  authorize("super_admin", "admin", "manager"),
  validate(createSchema),
  ctrl.createVariation,
);
router.put(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  validate(createSchema.fork(["name"], (s) => s.optional())),
  ctrl.updateVariation,
);
router.delete(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  ctrl.deleteVariation,
);

// Option management
router.post(
  "/:id/options",
  authorize("super_admin", "admin", "manager"),
  validate(optionSchema),
  ctrl.addOption,
);
router.put(
  "/:id/options/:optionId",
  authorize("super_admin", "admin", "manager"),
  ctrl.updateOption,
);
router.delete(
  "/:id/options/:optionId",
  authorize("super_admin", "admin", "manager"),
  ctrl.deleteOption,
);
router.patch(
  "/:id/options/reorder",
  authorize("super_admin", "admin", "manager"),
  ctrl.reorderOptions,
);

export default router;
