import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import respond from '../../shared/utils/response';
import env from '../../config/env';

// Helper to get client IP
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

// Helper to set refresh token cookie
function setRefreshTokenCookie(res: Response, token: string): void {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge,
    path:     '/api/v1/auth/refresh',
  });
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/api/v1/auth/refresh',
  });
}

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Create a new user account. Sends email verification link.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, confirmPassword]
 *             properties:
 *               name:            { type: string, example: "Emeka Obi" }
 *               email:           { type: string, format: email, example: "emeka@ebeano.com" }
 *               password:        { type: string, minLength: 8, example: "SecureP@ss1" }
 *               confirmPassword: { type: string, example: "SecureP@ss1" }
 *               phone:           { type: string, example: "+2348012345678" }
 *               role:            { type: string, enum: [admin, manager, cashier, warehouse_staff, hotel_staff, accountant, staff] }
 *     responses:
 *       201:
 *         description: Account created
 *       409:
 *         description: Email already exists
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, message } = await authService.register(req.body);
    respond.created(res, { message, data: { user } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:      { type: string, format: email, example: "247okolo@gmail.com" }
 *               password:   { type: string, example: "spotenugu123" }
 *               rememberMe: { type: boolean, default: false }
 *               device:     { type: string, example: "Chrome/Windows" }
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: refreshToken cookie (httpOnly)
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account locked or inactive
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ipAddress = getClientIp(req);
    const result = await authService.login({
      ...req.body,
      ipAddress,
      device: req.body.device || req.headers['user-agent'] || 'Unknown',
    });

    setRefreshTokenCookie(res, result.refreshToken);

    respond.success(res, {
      message: 'Login successful',
      data: {
        user:        result.user,
        accessToken: result.accessToken,
        sessionId:   result.sessionId,
        expiresIn:   result.expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Get a new access token using the refresh token from cookie or body.
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string, description: "Only required if not using cookie" }
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token: string | undefined =
      req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Refresh token not found. Please login again.',
      });
      return;
    }

    const result = await authService.refreshToken(token);
    setRefreshTokenCookie(res, result.refreshToken);

    respond.success(res, {
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.accessToken,
        sessionId:   result.sessionId,
        expiresIn:   result.expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    const sessionId = req.user?.sessionId;

    if (userId && sessionId) {
      await authService.logout(userId, sessionId, false);
    }

    clearRefreshTokenCookie(res);
    respond.success(res, { message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Logout all sessions (all devices)
 *     responses:
 *       200:
 *         description: All sessions terminated
 */
export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      await authService.logout(req.user.userId, req.user.sessionId, true);
    }
    clearRefreshTokenCookie(res);
    respond.success(res, { message: 'All sessions terminated successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "Token from verification email" }
 *     responses:
 *       200:
 *         description: Email verified
 *       401:
 *         description: Invalid or expired token
 */
export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.verifyEmail(req.body.token);
    respond.success(res, { message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend email verification
 *     security: []
 */
export async function resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.resendVerificationEmail(req.body.email);
    respond.success(res, { message: 'Verification email sent. Please check your inbox.' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     security: []
 */
export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.forgotPassword(req.body.email);
    respond.success(res, {
      message: 'If an account exists with this email, you will receive a password reset link.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token
 *     security: []
 */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    respond.success(res, { message: 'Password reset successfully. Please login with your new password.' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     tags: [Auth]
 *     summary: Change password (authenticated)
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    await authService.changePassword(
      req.user.userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    respond.success(res, { message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    const { userService } = await import('../users/user.service');
    const user = await userService.getUserById(req.user.userId);
    respond.success(res, { message: 'Profile retrieved', data: { user } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: Get all active sessions
 */
export async function getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    const sessions = await authService.getActiveSessions(req.user.userId);
    respond.success(res, { message: 'Sessions retrieved', data: { sessions } });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a specific session
 */
export async function revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    await authService.revokeSession(req.user.userId, req.params.sessionId as string);
    respond.success(res, { message: 'Session revoked successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send OTP to user's phone
 */
export async function sendOTP(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    await authService.sendOTP(req.user.userId, req.body.purpose);
    respond.success(res, { message: 'OTP sent to your registered phone number' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP code
 */
export async function verifyOTP(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    await authService.verifyOTPCode(req.user.userId, req.body.otp, req.body.purpose);
    respond.success(res, { message: 'OTP verified successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/set-pin:
 *   post:
 *     tags: [Auth]
 *     summary: Set POS PIN for quick access
 */
export async function setPin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    await authService.setPin(req.user.userId, req.body.currentPassword, req.body.pin);
    respond.success(res, { message: 'PIN set successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * @swagger
 * /auth/pin-login:
 *   post:
 *     tags: [Auth]
 *     summary: Quick PIN login for POS terminal
 *     security: []
 */
export async function pinLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ipAddress = getClientIp(req);
    const result = await authService.loginWithPin(
      req.body.pin,
      req.body.userId,
      ipAddress
    );

    setRefreshTokenCookie(res, result.refreshToken);

    respond.success(res, {
      message: 'PIN login successful',
      data: {
        user:        result.user,
        accessToken: result.accessToken,
        sessionId:   result.sessionId,
        expiresIn:   result.expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
}
