import { Types } from "mongoose";
import User, { IUser } from "./user.model";
import { hashPassword } from "../../shared/utils/password";
import {
  parsePagination,
  buildPaginationMeta,
  buildSearchQuery,
} from "../../shared/utils/pagination";
import {
  setCache,
  deleteCache,
  getOrSet,
  CachePrefix,
} from "../../shared/utils/cache";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  ForbiddenError,
} from "../../shared/utils/errors";
import { PaginationQuery, PaginatedResult } from "../../shared/types";
import logger from "../../config/logger";

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
  tenantId?: string;
  department?: string;
}

interface UpdateUserInput {
  name?: string;
  phone?: string;
  department?: string;
  avatar?: string;
  preferences?: Partial<IUser["preferences"]>;
  permissions?: string[];
}

export class UserService {
  // ── Get user by ID ─────────────────────────────────────────────────────────
  async getUserById(userId: string): Promise<Partial<IUser>> {
    return getOrSet(
      userId,
      async () => {
        const user = await User.findById(userId);
        if (!user) throw new NotFoundError("User");
        return user.toObject() as Partial<IUser>;
      },
      { prefix: CachePrefix.USER, ttl: 900 },
    );
  }

  // ── Get all users (paginated) ──────────────────────────────────────────────
  async getUsers(
    query: PaginationQuery & {
      role?: string;
      isActive?: boolean;
      tenantId?: string;
    },
    tenantId: string,
  ): Promise<PaginatedResult<Partial<IUser>>> {
    const { page, limit, skip, sort } = parsePagination(query);

    const filter: Record<string, unknown> = { tenantId };

    if (query.role) filter.role = query.role;
    if (query.isActive !== undefined) filter.isActive = query.isActive;

    if (query.search) {
      const searchFilter = buildSearchQuery(query.search, [
        "name",
        "email",
        "employeeId",
        "department",
      ]);
      Object.assign(filter, searchFilter);
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    return {
      data: users as Partial<IUser>[],
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  // ── Create user (admin action) ─────────────────────────────────────────────
  async createUser(
    input: CreateUserInput,
    createdBy: string,
  ): Promise<Partial<IUser>> {
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing)
      throw new ConflictError("A user with this email already exists");

    const hashedPassword = await hashPassword(input.password);
    const tenantId = input.tenantId ?? "default";

    const count = await User.countDocuments({ tenantId });
    const employeeId = `EBA-${String(count + 1).padStart(4, "0")}`;

    const user = await User.create({
      ...input,
      email: input.email.toLowerCase(),
      password: hashedPassword,
      tenantId,
      employeeId,
    });

    logger.info(`User created by ${createdBy}: ${user.email} (${user.role})`);

    return user.toObject() as Partial<IUser>;
  }

  // ── Update user ────────────────────────────────────────────────────────────
  async updateUser(
    userId: string,
    input: UpdateUserInput,
    requesterId: string,
    requesterRole: string,
  ): Promise<Partial<IUser>> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User");

    // Only admin/manager can update other users' roles/permissions
    if (
      input.permissions &&
      !["super_admin", "admin"].includes(requesterRole)
    ) {
      throw new ForbiddenError("Only admins can update permissions");
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: input },
      { new: true, runValidators: true },
    );

    if (!updated) throw new NotFoundError("User");

    // Invalidate cache
    await deleteCache(userId, CachePrefix.USER);

    logger.info(`User ${userId} updated by ${requesterId}`);

    return updated.toObject() as Partial<IUser>;
  }

  // ── Update user role ───────────────────────────────────────────────────────
  async updateUserRole(
    userId: string,
    newRole: string,
    requesterId: string,
  ): Promise<Partial<IUser>> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User");

    // Cannot change super_admin role
    if (user.role === "super_admin") {
      throw new ForbiddenError("Cannot change super_admin role");
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { role: newRole },
      { new: true, runValidators: true },
    );

    if (!updated) throw new NotFoundError("User");

    await deleteCache(userId, CachePrefix.USER);
    logger.info(`User ${userId} role changed to ${newRole} by ${requesterId}`);

    return updated.toObject() as Partial<IUser>;
  }

  // ── Toggle user active status ──────────────────────────────────────────────
  async toggleUserStatus(
    userId: string,
    requesterId: string,
  ): Promise<Partial<IUser>> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User");

    if (userId === requesterId) {
      throw new BadRequestError("Cannot deactivate your own account");
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { isActive: !user.isActive },
      { new: true },
    );

    if (!updated) throw new NotFoundError("User");

    await deleteCache(userId, CachePrefix.USER);
    logger.info(
      `User ${userId} ${updated.isActive ? "activated" : "deactivated"} by ${requesterId}`,
    );

    return updated.toObject() as Partial<IUser>;
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  async deleteUser(userId: string, requesterId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User");

    if (userId === requesterId) {
      throw new BadRequestError("Cannot delete your own account");
    }

    if (user.role === "super_admin") {
      throw new ForbiddenError("Cannot delete super_admin account");
    }

    await User.findByIdAndDelete(userId);
    await deleteCache(userId, CachePrefix.USER);

    logger.info(`User ${userId} deleted by ${requesterId}`);
  }

  // ── Update profile photo ───────────────────────────────────────────────────
  async updateAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<Partial<IUser>> {
    const updated = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true },
    );
    if (!updated) throw new NotFoundError("User");

    await deleteCache(userId, CachePrefix.USER);
    return updated.toObject() as Partial<IUser>;
  }

  // ── Update preferences ─────────────────────────────────────────────────────
  async updatePreferences(
    userId: string,
    preferences: Partial<IUser["preferences"]>,
  ): Promise<Partial<IUser>> {
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { preferences } },
      { new: true },
    );
    if (!updated) throw new NotFoundError("User");

    await deleteCache(userId, CachePrefix.USER);
    return updated.toObject() as Partial<IUser>;
  }

  // ── Get users by role ──────────────────────────────────────────────────────
  async getUsersByRole(
    role: string,
    tenantId: string,
  ): Promise<Partial<IUser>[]> {
    const users = await User.find({ role, tenantId, isActive: true })
      .select("name email employeeId department")
      .lean();
    return users as Partial<IUser>[];
  }

  // ── User stats ─────────────────────────────────────────────────────────────
  async getUserStats(tenantId: string) {
    const [total, active, byRole] = await Promise.all([
      User.countDocuments({ tenantId }),
      User.countDocuments({ tenantId, isActive: true }),
      User.aggregate([
        { $match: { tenantId } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.reduce<Record<string, number>>((acc, item) => {
        acc[item._id as string] = item.count as number;
        return acc;
      }, {}),
    };
  }
}

export const userService = new UserService();
