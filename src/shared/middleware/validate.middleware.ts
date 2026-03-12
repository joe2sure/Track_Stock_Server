import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../utils/errors';

type ValidateTarget = 'body' | 'query' | 'params';

interface SchemaMap {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

const JOI_OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,     // Return all errors, not just first
  allowUnknown: false,   // Disallow unknown fields
  stripUnknown: true,    // Strip unknown fields from validated output
  convert: true,         // Auto-convert types (e.g., string "123" → number 123)
};

// ── Validate a single target ────────────────────────────────────────────────
export function validate(schema: Joi.ObjectSchema, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[target], JOI_OPTIONS);

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
      }));
      next(new ValidationError('Validation failed', errors));
      return;
    }

    // Replace with validated & sanitized value
    (req as Record<string, unknown>)[target] = value;
    next();
  };
}

// ── Validate multiple targets at once ──────────────────────────────────────
export function validateAll(schemas: SchemaMap) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const allErrors: Array<{ field: string; message: string }> = [];

    for (const [target, schema] of Object.entries(schemas) as [ValidateTarget, Joi.ObjectSchema][]) {
      if (!schema) continue;
      const { error, value } = schema.validate(req[target], JOI_OPTIONS);

      if (error) {
        const fieldErrors = error.details.map(detail => ({
          field: `${target}.${detail.path.join('.')}`,
          message: detail.message.replace(/['"]/g, ''),
        }));
        allErrors.push(...fieldErrors);
      } else {
        (req as Record<string, unknown>)[target] = value;
      }
    }

    if (allErrors.length > 0) {
      next(new ValidationError('Validation failed', allErrors));
      return;
    }

    next();
  };
}

// ── Common Joi schema helpers ────────────────────────────────────────────────
export const joiSchemas = {
  mongoId: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .messages({ 'string.pattern.base': 'Invalid ID format' }),

  paginationQuery: Joi.object({
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    search:    Joi.string().max(200).trim().optional(),
    sortBy:    Joi.string().max(50).optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  dateRange: Joi.object({
    from: Joi.date().iso().optional(),
    to:   Joi.date().iso().min(Joi.ref('from')).optional(),
  }),

  idParams: Joi.object({
    id: Joi.string()
      .pattern(/^[a-f\d]{24}$/i)
      .required()
      .messages({ 'string.pattern.base': 'Invalid resource ID format' }),
  }),

  email: Joi.string().email().lowercase().trim(),

  phone: Joi.string()
    .pattern(/^\+?[\d\s\-().]{7,20}$/)
    .messages({ 'string.pattern.base': 'Invalid phone number format' }),

  password: Joi.string()
    .min(8)
    .max(128)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
    }),

  currency: Joi.string().uppercase().length(3).default('NGN'),

  positiveNumber: Joi.number().positive().precision(2),

  nonNegativeInt: Joi.number().integer().min(0),
};
