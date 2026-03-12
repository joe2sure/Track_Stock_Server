import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import env from '../../config/env';

// ── Response handler ─────────────────────────────────────────────────────────
const rateLimitHandler = (_req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  });
};

// ── Skip function for testing ────────────────────────────────────────────────
const skipInTest = (): boolean => process.env.NODE_ENV === 'test';

// ── Global rate limiter ──────────────────────────────────────────────────────
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: skipInTest,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  keyGenerator: (req: Request): string => req.ip ?? 'unknown',
});

// ── Auth rate limiter (stricter) ─────────────────────────────────────────────
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: skipInTest,
  keyGenerator: (req: Request): string => req.ip ?? 'unknown',
});

// ── Password reset limiter (very strict) ─────────────────────────────────────
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      success: false,
      message: 'Too many password reset attempts. Please wait 1 hour.',
    });
  },
  skip: skipInTest,
});

// ── Upload rate limiter ───────────────────────────────────────────────────────
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: skipInTest,
});

// ── API key-based limiter for integrations ────────────────────────────────────
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: skipInTest,
  keyGenerator: (req: Request): string => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey ?? req.ip ?? 'unknown';
  },
});

// ── POS transaction limiter ───────────────────────────────────────────────────
export const posRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: skipInTest,
});
