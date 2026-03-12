import { Router } from "express";
import * as ctrl from "./category.controller";
import {
  authenticate,
  authorize,
} from "../../shared/middleware/auth.middleware";
import { validate } from "../../shared/middleware/validate.middleware";
import Joi from "joi";
import { joiSchemas } from "../../shared/middleware/validate.middleware";

const router = Router();
router.use(authenticate);

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  image: Joi.string().uri().optional(),
  parentId: joiSchemas.mongoId.optional(),
  sortOrder: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

router.get("/tree", ctrl.getCategoryTree);
router.get("/stats", ctrl.getCategoryStats);
router.get("/", ctrl.getCategories);
router.get("/:id", ctrl.getCategoryById);

router.post(
  "/",
  authorize("super_admin", "admin", "manager"),
  validate(createSchema),
  ctrl.createCategory,
);

router.put(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  validate(createSchema.fork(["name"], (s) => s.optional())),
  ctrl.updateCategory,
);

router.patch(
  "/reorder",
  authorize("super_admin", "admin", "manager"),
  validate(
    Joi.object({
      items: Joi.array()
        .items(
          Joi.object({
            id: Joi.string().required(),
            sortOrder: Joi.number().required(),
          }),
        )
        .required(),
    }),
  ),
  ctrl.reorderCategories,
);

router.delete(
  "/:id",
  authorize("super_admin", "admin", "manager"),
  ctrl.deleteCategory,
);

export default router;
