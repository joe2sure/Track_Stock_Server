import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  getSessions,
  revokeSession,
  sendOTP,
  verifyOTP,
  setPin,
  pinLogin,
} from './auth.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  verifyOtpSchema,
  setPinSchema,
  pinLoginSchema,
} from './auth.validation';
import {
  authRateLimiter,
  passwordResetRateLimiter,
} from '../../shared/middleware/rateLimiter.middleware';

const router = Router();

// ── Public routes ─────────────────────────────────────────────────────────────
router.post('/register',
  authRateLimiter,
  validate(registerSchema),
  register
);

router.post('/login',
  authRateLimiter,
  validate(loginSchema),
  login
);

router.post('/pin-login',
  authRateLimiter,
  validate(pinLoginSchema),
  pinLogin
);

router.post('/refresh',
  refreshToken
);

router.post('/verify-email',
  validate(verifyEmailSchema),
  verifyEmail
);

router.post('/resend-verification',
  authRateLimiter,
  forgotPassword  // reuse email validation
);

router.post('/forgot-password',
  passwordResetRateLimiter,
  validate(forgotPasswordSchema),
  forgotPassword
);

router.post('/reset-password',
  passwordResetRateLimiter,
  validate(resetPasswordSchema),
  resetPassword
);

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(authenticate);

router.get('/me',         getMe);
router.post('/logout',    logout);
router.post('/logout-all', logoutAll);

router.put('/change-password',
  validate(changePasswordSchema),
  changePassword
);

router.post('/set-pin',
  validate(setPinSchema),
  setPin
);

router.post('/send-otp',  sendOTP);

router.post('/verify-otp',
  validate(verifyOtpSchema),
  verifyOTP
);

router.get('/sessions',         getSessions);
router.delete('/sessions/:sessionId', revokeSession);

export default router;
