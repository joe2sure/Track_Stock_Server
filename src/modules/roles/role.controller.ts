import { Request, Response, NextFunction } from 'express';
import { roleService } from './role.service';
import respond from '../../shared/utils/response';

export async function getRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await roleService.getRoles(req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Roles retrieved', data: { roles } });
  } catch (e) { next(e); }
}

export async function getPermissionRegistry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const registry = roleService.getPermissionRegistry();
    respond.success(res, { message: 'Permission registry', data: { registry } });
  } catch (e) { next(e); }
}

export async function getRoleById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = await roleService.getRoleById(req.params.id, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Role retrieved', data: { role } });
  } catch (e) { next(e); }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = await roleService.createRole(req.body, req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.created(res, { message: 'Role created', data: { role } });
  } catch (e) { next(e); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = await roleService.updateRole(req.params.id, req.body, req.user?.tenantId ?? 'default');
    respond.success(res, { message: 'Role updated', data: { role } });
  } catch (e) { next(e); }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await roleService.deleteRole(req.params.id, req.user?.tenantId ?? 'default');
    respond.noContent(res);
  } catch (e) { next(e); }
}

export async function cloneRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = await roleService.cloneRole(
      req.params.id, req.body.newName,
      req.user?.tenantId ?? 'default', req.user?.userId ?? ''
    );
    respond.created(res, { message: 'Role cloned', data: { role } });
  } catch (e) { next(e); }
}

export async function seedSystemRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await roleService.seedSystemRoles(req.user?.tenantId ?? 'default', req.user?.userId ?? '');
    respond.success(res, { message: 'System roles seeded successfully', data: null });
  } catch (e) { next(e); }
}
