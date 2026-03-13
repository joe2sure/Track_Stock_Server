import Joi from 'joi';
import { joiSchemas } from '../../shared/middleware/validate.middleware';

// ── Register ──────────────────────────────────────────────────────────────────
export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.min':  'Name must be at least 2 characters',
    'string.max':  'Name must not exceed 100 characters',
    'any.required': 'Name is required',
  }),
  email: joiSchemas.email.required().messages({
    'string.email':  'Please provide a valid email address',
    'any.required':  'Email is required',
  }),
  password: Joi.string().min(8).max(128).required().messages({
    'string.min':   'Password must be at least 8 characters',
    'any.required': 'Password is required',
  }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only':     'Passwords do not match',
      'any.required': 'Please confirm your password',
    }),
  phone: joiSchemas.phone.optional(),
  role: Joi.string()
    .valid('admin', 'manager', 'cashier', 'warehouse_staff', 'hotel_staff', 'accountant', 'staff')
    .default('staff'),
  tenantId: Joi.string().trim().default('default'),
  inviteCode: Joi.string().optional(),
});

// ── Login ──────────────────────────────────────────────────────────────────────
export const loginSchema = Joi.object({
  email: joiSchemas.email.required().messages({
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
  rememberMe: Joi.boolean().default(false),
  device:  Joi.string().max(200).optional(),
});

// ── PIN Login ──────────────────────────────────────────────────────────────────
export const pinLoginSchema = Joi.object({
  pin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
    'string.length':        'PIN must be exactly 4 digits',
    'string.pattern.base':  'PIN must contain only digits',
    'any.required':         'PIN is required',
  }),
  userId: Joi.string().pattern(/^[a-f\d]{24}$/i).optional(),
});

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().optional(), // also accepted from cookie
});

// ── Forgot Password ────────────────────────────────────────────────────────────
export const forgotPasswordSchema = Joi.object({
  email: joiSchemas.email.required().messages({
    'any.required': 'Email is required',
  }),
});

// ── Reset Password ─────────────────────────────────────────────────────────────
export const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    'any.required': 'Reset token is required',
  }),
  password: Joi.string().min(8).max(128).required().messages({
    'string.min':   'Password must be at least 8 characters',
    'any.required': 'New password is required',
  }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only':     'Passwords do not match',
      'any.required': 'Please confirm your new password',
    }),
});

// ── Change Password ────────────────────────────────────────────────────────────
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: Joi.string().min(8).max(128).required().messages({
    'string.min':   'New password must be at least 8 characters',
    'any.required': 'New password is required',
  }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only':     'Passwords do not match',
      'any.required': 'Please confirm your new password',
    }),
});

// ── Verify Email ───────────────────────────────────────────────────────────────
export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

// ── Verify OTP ──────────────────────────────────────────────────────────────────
export const verifyOtpSchema = Joi.object({
  otp: Joi.string()
    .length(6)
    .pattern(/^\d+$/)
    .required()
    .messages({
      'string.length':        'OTP must be exactly 6 digits',
      'string.pattern.base':  'OTP must contain only digits',
      'any.required':         'OTP is required',
    }),
  purpose: Joi.string()
    .valid('phone_verify', 'login', 'password_reset')
    .required(),
  userId: Joi.string().pattern(/^[a-f\d]{24}$/i).optional(),
});

// ── Set PIN ────────────────────────────────────────────────────────────────────
export const setPinSchema = Joi.object({
  pin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
    'string.length':        'PIN must be exactly 4 digits',
    'string.pattern.base':  'PIN must contain only digits',
    'any.required':         'PIN is required',
  }),
  confirmPin: Joi.string()
    .valid(Joi.ref('pin'))
    .required()
    .messages({ 'any.only': 'PINs do not match' }),
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password required to set PIN',
  }),
});
