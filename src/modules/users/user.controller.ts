import { Request, Response, NextFunction } from "express";
import { userService } from "./user.service";
import respond from "../../shared/utils/response";

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users (paginated)
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SearchParam'
 *       - name: role
 *         in: query
 *         schema:
 *           type: string
 *           enum: [admin, manager, cashier, warehouse_staff, hotel_staff, accountant, staff]
 *       - name: isActive
 *         in: query
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Users list
 */
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user?.tenantId ?? "default";
    const result = await userService.getUsers(
      req.query as Record<string, string>,
      tenantId,
    );
    respond.paginated(res, result.data, result.pagination);
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 */
export async function getUserById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.getUserById(req.params.id as string);
    respond.success(res, { message: "User retrieved", data: { user } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new user (admin only)
 */
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.createUser(
      { ...req.body, tenantId: req.user?.tenantId ?? "default" },
      req.user?.userId ?? "system",
    );
    respond.created(res, {
      message: "User created successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update user profile
 */
export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.updateUser(
      req.params.id as string,
      req.body,
      req.user?.userId ?? "",
      req.user?.role ?? "",
    );
    respond.success(res, {
      message: "User updated successfully",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change user role (admin only)
 */
export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.updateUserRole(
      req.params.id as string,
      req.body.role,
      req.user?.userId ?? "",
    );
    respond.success(res, { message: "User role updated", data: { user } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/{id}/toggle-status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate a user
 */
export async function toggleUserStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.toggleUserStatus(
      req.params.id as string,
      req.user?.userId ?? "",
    );
    respond.success(res, {
      message: `User ${(user as { isActive?: boolean }).isActive ? "activated" : "deactivated"} successfully`,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user (admin only)
 */
export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await userService.deleteUser(req.params.id as string, req.user?.userId ?? "");
    respond.noContent(res);
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get user statistics
 */
export async function getUserStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user?.tenantId ?? "default";
    const stats = await userService.getUserStats(tenantId);
    respond.success(res, { message: "User stats retrieved", data: { stats } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /users/me/preferences:
 *   put:
 *     tags: [Users]
 *     summary: Update current user preferences
 */
export async function updateMyPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await userService.updatePreferences(
      req.user?.userId ?? "",
      req.body,
    );
    respond.success(res, { message: "Preferences updated", data: { user } });
  } catch (error) {
    next(error);
  }
}
