import { Router } from "express";
import * as ctrl from "./unit.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import Joi from "joi";

const router = Router();
router.use(authenticate);

const schema = Joi.object({
  name: Joi.string().trim().min(1).max(60).required(),
  abbreviation: Joi.string().trim().min(1).max(10).required(),
  type: Joi.string()
    .valid("count", "weight", "volume", "length", "area", "time", "digital")
    .required(),
  baseUnit: Joi.string().optional(),
  conversionFactor: Joi.number().positive().default(1),
  isBase: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
});

router.get("/grouped", ctrl.getUnitsByType);
router.get("/", ctrl.getUnits);
router.get("/:id", ctrl.getUnitById);

router.post(
  "/seed-defaults",
  authorize("super_admin", "admin"),
  ctrl.seedUnits,
);

router.post(
  "/",
  authorize("super_admin", "admin", "manager"),
  validate(schema),
  ctrl.createUnit,
);

router.put(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  validate(schema.fork(["name", "abbreviation", "type"], (s) => s.optional())),
  ctrl.updateUnit,
);

router.delete(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  ctrl.deleteUnit,
);

export default router;
