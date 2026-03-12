import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  AppError,
  ValidationError,
  isDuplicateKeyError,
} from '../utils/errors';
import logger from '../../config/logger';

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

interface MongoValidationError extends Error {
  errors: Record<string, { message: string; path: string }>;
}

// ── 404 Not Found handler ────────────────────────────────────────────────────
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route '${req.method} ${req.originalUrl}' not found`,
    availableAt: '/api/v1',
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
export function globalErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV === 'development';

  // Log every error
  logger.error({
    message: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as { user?: { userId: string } }).user?.userId,
  });

  // ── Operational errors (our custom AppError) ──────────────────────────────
  if (error instanceof AppError && error.isOperational) {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errors: error.errors,
        ...(isDev && { stack: error.stack }),
      });
      return;
    }

    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      ...(isDev && { stack: error.stack }),
    });
    return;
  }

  // ── Mongoose validation errors ─────────────────────────────────────────────
  if (error instanceof mongoose.Error.ValidationError) {
    const mongoValidErr = error as MongoValidationError;
    const errors = Object.values(mongoValidErr.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      ...(isDev && { stack: error.stack }),
    });
    return;
  }

  // ── MongoDB duplicate key error ────────────────────────────────────────────
  if (isDuplicateKeyError(error)) {
    const mongoErr = error as MongoError;
    const field = mongoErr.keyValue ? Object.keys(mongoErr.keyValue)[0] : 'field';
    res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists`,
      ...(isDev && { stack: error.stack }),
    });
    return;
  }

  // ── Mongoose CastError (invalid ObjectId) ─────────────────────────────────
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      message: `Invalid value for field '${error.path}': ${error.value}`,
      ...(isDev && { stack: error.stack }),
    });
    return;
  }

  // ── JSON parse errors ──────────────────────────────────────────────────────
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
    });
    return;
  }

  // ── JWT errors (fallback, should be caught in middleware) ──────────────────
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({ success: false, message: 'Invalid token' });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, message: 'Token expired' });
    return;
  }

  // ── Multer errors ──────────────────────────────────────────────────────────
  if (error.name === 'MulterError') {
    const multerErr = error as Error & { code: string; field: string };
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'File too large. Maximum allowed size exceeded.',
      LIMIT_FILE_COUNT: 'Too many files uploaded.',
      LIMIT_FIELD_VALUE: 'Field value too long.',
      LIMIT_UNEXPECTED_FILE: `Unexpected field: ${multerErr.field}`,
    };
    res.status(400).json({
      success: false,
      message: messages[multerErr.code] ?? 'File upload error',
    });
    return;
  }

  // ── Unknown / programming errors ───────────────────────────────────────────
  logger.error(`UNHANDLED ERROR: ${error.message}`, { stack: error.stack });

  res.status(500).json({
    success: false,
    message: isDev ? error.message : 'An internal server error occurred. Please try again.',
    ...(isDev && { stack: error.stack }),
  });
}
