import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { getCache, CachePrefix } from '../utils/cache';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { UserRole } from '../types';
import logger from '../../config/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    tenantId: string;
    sessionId: string;
  };
}

// ── Protect: require valid JWT ──────────────────────────────────────────────
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header or cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken as string;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. Please provide a valid token.');
    }

    // Verify token
    const payload = verifyAccessToken(token);

    // Check if token is blacklisted (logout)
    const isBlacklisted = await getCache<boolean>(
      payload.sessionId,
      CachePrefix.BLACKLIST
    );
    if (isBlacklisted) {
      throw new UnauthorizedError('Session has been revoked. Please login again.');
    }

    // Attach user to request
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

// ── Authorize: require specific roles ──────────────────────────────────────
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied: User ${req.user.userId} (${req.user.role}) tried to access ${req.path}`);
      next(new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`));
      return;
    }

    next();
  };
}

// ── Admin only ──────────────────────────────────────────────────────────────
export function adminOnly(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }

  if (!['super_admin', 'admin'].includes(req.user.role)) {
    next(new ForbiddenError('Admin access required'));
    return;
  }

  next();
}

// ── Manager and above ───────────────────────────────────────────────────────
export function managerOrAbove(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }

  const allowed: UserRole[] = ['super_admin', 'admin', 'manager'];
  if (!allowed.includes(req.user.role)) {
    next(new ForbiddenError('Manager or above access required'));
    return;
  }

  next();
}

// ── Optional authentication (attach user if token present) ─────────────────
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
    };
  } catch {
    // Ignore errors for optional auth
  }

  next();
}

// ── Self or admin: user can only access their own resource unless admin ─────
export function selfOrAdmin(userIdParam = 'id') {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const targetId = req.params[userIdParam];
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
    const isSelf = req.user.userId === targetId;

    if (!isAdmin && !isSelf) {
      next(new ForbiddenError('You can only access your own resources'));
      return;
    }

    next();
  };
}
