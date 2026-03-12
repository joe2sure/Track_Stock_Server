import { Router } from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getUserStats,
  updateMyPreferences,
} from "./user.controller";
import {
  authenticate,
  authorize,
  adminOnly,
  selfOrAdmin,
} from "../../shared/middleware/auth.middleware";
import {
  validate,
  joiSchemas,
} from "../../shared/middleware/validate.middleware";
import Joi from "joi";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Stats
router.get("/stats", getUserStats);

// Preferences
router.put("/me/preferences", updateMyPreferences);

// Admin & Manager only
router.get("/", authorize("super_admin", "admin", "manager"), getUsers);

router.post(
  "/",
  adminOnly,
  validate(
    Joi.object({
      name: Joi.string().min(2).max(100).required(),
      email: joiSchemas.email.required(),
      password: joiSchemas.password.required(),
      phone: joiSchemas.phone.optional(),
      role: Joi.string()
        .valid(
          "admin",
          "manager",
          "cashier",
          "warehouse_staff",
          "hotel_staff",
          "accountant",
          "staff",
        )
        .default("staff"),
      department: Joi.string().optional(),
    }),
  ),
  createUser,
);

router.get("/:id", getUserById);

router.put("/:id", updateUser);

router.patch(
  "/:id/role",
  adminOnly,
  validate(Joi.object({ role: Joi.string().required() })),
  updateUserRole,
);

router.patch(
  "/:id/toggle-status",
  authorize("super_admin", "admin", "manager"),
  toggleUserStatus,
);

router.delete("/:id", adminOnly, deleteUser);

export default router;
