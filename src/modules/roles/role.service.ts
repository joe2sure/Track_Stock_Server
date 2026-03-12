import Role, { IRole, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from './role.model';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/utils/errors';
import { getOrSet, deleteCache, CachePrefix } from '../../shared/utils/cache';
import logger from '../../config/logger';

export class RoleService {

  // ── Seed system roles for a tenant ────────────────────────────────────────
  async seedSystemRoles(tenantId: string, createdBy: string): Promise<void> {
    const systemRoles = [
      { name: 'super_admin',    displayName: 'Super Administrator', description: 'Full system access' },
      { name: 'admin',          displayName: 'Administrator',       description: 'Full access except role management' },
      { name: 'manager',        displayName: 'Manager',             description: 'Operational management access' },
      { name: 'cashier',        displayName: 'Cashier / Front Desk',description: 'POS and hotel front desk access' },
      { name: 'warehouse_staff',displayName: 'Warehouse Staff',     description: 'Stock and inventory operations' },
      { name: 'hotel_staff',    displayName: 'Hotel Staff',         description: 'Hotel operations and housekeeping' },
      { name: 'accountant',     displayName: 'Accountant',          description: 'Financial reporting and expense management' },
      { name: 'staff',          displayName: 'General Staff',       description: 'Basic view and personal expense access' },
    ];

    for (const r of systemRoles) {
      await Role.updateOne(
        { name: r.name, tenantId },
        {
          $setOnInsert: {
            ...r,
            permissions:  DEFAULT_ROLE_PERMISSIONS[r.name] ?? [],
            isSystemRole: true,
            isActive:     true,
            tenantId,
            createdBy,
          },
        },
        { upsert: true }
      );
    }
    logger.info(`System roles seeded for tenant: ${tenantId}`);
  }

  // ── Get all roles ─────────────────────────────────────────────────────────
  async getRoles(tenantId: string): Promise<IRole[]> {
    return getOrSet(`roles:${tenantId}`, async () => {
      return Role.find({ tenantId, isActive: true })
        .sort({ isSystemRole: -1, name: 1 })
        .lean() as Promise<IRole[]>;
    }, { prefix: CachePrefix.DASHBOARD, ttl: 300 });
  }

  // ── Get role by id ────────────────────────────────────────────────────────
  async getRoleById(id: string, tenantId: string): Promise<IRole> {
    const role = await Role.findOne({ _id: id, tenantId });
    if (!role) throw new NotFoundError('Role');
    return role;
  }

  // ── Create custom role ────────────────────────────────────────────────────
  async createRole(
    input: { name: string; displayName: string; description?: string; permissions: string[] },
    tenantId: string,
    userId: string
  ): Promise<IRole> {
    const exists = await Role.findOne({ name: input.name.toLowerCase(), tenantId });
    if (exists) throw new ConflictError(`Role "${input.name}" already exists`);

    // Validate permissions
    const invalid = input.permissions.filter(p => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) throw new BadRequestError(`Invalid permissions: ${invalid.join(', ')}`);

    const role = await Role.create({
      name:         input.name.toLowerCase(),
      displayName:  input.displayName,
      description:  input.description,
      permissions:  input.permissions,
      isSystemRole: false,
      tenantId,
      createdBy:    userId,
    });

    await deleteCache(`roles:${tenantId}`, CachePrefix.DASHBOARD);
    return role;
  }

  // ── Update role permissions ───────────────────────────────────────────────
  async updateRole(
    id: string,
    input: { displayName?: string; description?: string; permissions?: string[] },
    tenantId: string
  ): Promise<IRole> {
    const role = await Role.findOne({ _id: id, tenantId });
    if (!role) throw new NotFoundError('Role');

    if (input.permissions) {
      const invalid = input.permissions.filter(p => !ALL_PERMISSIONS.includes(p));
      if (invalid.length) throw new BadRequestError(`Invalid permissions: ${invalid.join(', ')}`);

      // Protect super_admin — always has all permissions
      if (role.name === 'super_admin') {
        throw new BadRequestError('Cannot modify super_admin permissions');
      }
    }

    const updated = await Role.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    await deleteCache(`roles:${tenantId}`, CachePrefix.DASHBOARD);
    return updated!;
  }

  // ── Delete custom role ────────────────────────────────────────────────────
  async deleteRole(id: string, tenantId: string): Promise<void> {
    const role = await Role.findOne({ _id: id, tenantId });
    if (!role) throw new NotFoundError('Role');
    if (role.isSystemRole) throw new BadRequestError('Cannot delete a system role');
    await Role.findByIdAndDelete(id);
    await deleteCache(`roles:${tenantId}`, CachePrefix.DASHBOARD);
  }

  // ── Get permission registry ───────────────────────────────────────────────
  getPermissionRegistry(): Record<string, string[]> {
    // Group permissions by resource
    const registry: Record<string, string[]> = {};
    for (const p of ALL_PERMISSIONS) {
      const [resource] = p.split(':');
      if (!registry[resource]) registry[resource] = [];
      registry[resource].push(p);
    }
    return registry;
  }

  // ── Check if user has permission ──────────────────────────────────────────
  async hasPermission(
    roleName: string,
    permission: string,
    tenantId: string,
    customPermissions?: string[]
  ): Promise<boolean> {
    // Custom per-user overrides take precedence
    if (customPermissions?.length) {
      return customPermissions.includes(permission);
    }

    const roles = await this.getRoles(tenantId);
    const role  = roles.find(r => r.name === roleName);
    return role?.permissions.includes(permission) ?? false;
  }

  // ── Clone role ────────────────────────────────────────────────────────────
  async cloneRole(id: string, newName: string, tenantId: string, userId: string): Promise<IRole> {
    const source = await Role.findOne({ _id: id, tenantId });
    if (!source) throw new NotFoundError('Role');

    return this.createRole({
      name:         newName,
      displayName:  `${source.displayName} (Copy)`,
      description:  source.description,
      permissions:  source.permissions,
    }, tenantId, userId);
  }
}

export const roleService = new RoleService();
