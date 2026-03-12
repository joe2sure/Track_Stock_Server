import { Router } from "express";
import * as ctrl from "./warehouse.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import { joiSchemas } from "../../shared/middleware/validate.middleware";
import Joi from "joi";

const router = Router();
router.use(authenticate);

const schema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  code: Joi.string().trim().min(1).max(20).required(),
  description: Joi.string().max(500).optional(),
  address: Joi.string().max(300).optional(),
  city: Joi.string().trim().required(),
  state: Joi.string().trim().required(),
  country: Joi.string().default("Nigeria"),
  phone: joiSchemas.phone.optional(),
  email: joiSchemas.email.optional(),
  managerId: joiSchemas.mongoId.optional(),
  capacity: Joi.number().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

router.get("/stats", ctrl.getWarehouseStats);
router.get("/", ctrl.getWarehouses);
router.get("/:id", ctrl.getWarehouseById);

router.post(
  "/",
  authorize("super_admin", "admin", "manager"),
  validate(schema),
  ctrl.createWarehouse,
);
router.put(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  validate(schema.fork(["name", "code", "city", "state"], (s) => s.optional())),
  ctrl.updateWarehouse,
);
router.patch(
  "/:id/set-default",
  authorize("super_admin", "admin"),
  ctrl.setDefaultWarehouse,
);
router.delete("/:id", authorize("super_admin", "admin"), ctrl.deleteWarehouse);

export default router;
