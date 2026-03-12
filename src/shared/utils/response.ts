import { Response } from 'express';
import { PaginationMeta, ValidationError } from '../types';

interface ResponseOptions {
  message?: string;
  data?: unknown;
  pagination?: PaginationMeta;
  errors?: ValidationError[];
  meta?: Record<string, unknown>;
}

class ResponseUtil {
  // ── 200 OK ──────────────────────────────────────────────────────────────────
  success(res: Response, options: ResponseOptions = {}): Response {
    return res.status(200).json({
      success: true,
      message: options.message ?? 'Request successful',
      data: options.data ?? null,
      ...(options.pagination && { pagination: options.pagination }),
      ...(options.meta && { meta: options.meta }),
    });
  }

  // ── 201 Created ─────────────────────────────────────────────────────────────
  created(res: Response, options: ResponseOptions = {}): Response {
    return res.status(201).json({
      success: true,
      message: options.message ?? 'Resource created successfully',
      data: options.data ?? null,
      ...(options.meta && { meta: options.meta }),
    });
  }

  // ── 204 No Content ───────────────────────────────────────────────────────────
  noContent(res: Response): Response {
    return res.status(204).send();
  }

  // ── 400 Bad Request ──────────────────────────────────────────────────────────
  badRequest(res: Response, message: string, errors?: ValidationError[]): Response {
    return res.status(400).json({
      success: false,
      message,
      ...(errors && errors.length > 0 && { errors }),
    });
  }

  // ── 401 Unauthorized ─────────────────────────────────────────────────────────
  unauthorized(res: Response, message = 'Authentication required'): Response {
    return res.status(401).json({
      success: false,
      message,
    });
  }

  // ── 403 Forbidden ────────────────────────────────────────────────────────────
  forbidden(res: Response, message = 'Permission denied'): Response {
    return res.status(403).json({
      success: false,
      message,
    });
  }

  // ── 404 Not Found ────────────────────────────────────────────────────────────
  notFound(res: Response, resource = 'Resource'): Response {
    return res.status(404).json({
      success: false,
      message: `${resource} not found`,
    });
  }

  // ── 409 Conflict ─────────────────────────────────────────────────────────────
  conflict(res: Response, message: string): Response {
    return res.status(409).json({
      success: false,
      message,
    });
  }

  // ── 422 Validation Error ─────────────────────────────────────────────────────
  validationError(res: Response, message: string, errors: ValidationError[]): Response {
    return res.status(422).json({
      success: false,
      message,
      errors,
    });
  }

  // ── 429 Rate Limited ─────────────────────────────────────────────────────────
  tooManyRequests(res: Response, message = 'Too many requests'): Response {
    return res.status(429).json({
      success: false,
      message,
    });
  }

  // ── 500 Internal Error ───────────────────────────────────────────────────────
  internalError(res: Response, message = 'Internal server error', stack?: string): Response {
    return res.status(500).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && stack && { stack }),
    });
  }

  // ── Paginated ────────────────────────────────────────────────────────────────
  paginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    message = 'Data retrieved successfully'
  ): Response {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination,
    });
  }

  // ── Generic error handler for caught errors ──────────────────────────────────
  error(res: Response, statusCode: number, message: string, extras?: Record<string, unknown>): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      ...extras,
    });
  }
}

const respond = new ResponseUtil();
export { respond };
export default respond;
