import { Types } from 'mongoose';
import User, { IUser } from '../users/user.model';
import {
  generateTokenPair,
  verifyRefreshToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  getRefreshTokenExpiry,
} from '../../shared/utils/jwt';
import { hashPassword, comparePassword } from '../../shared/utils/password';
import { generateOTPWithHash, hashOTP, verifyOTP } from '../../shared/utils/otp';
import { setCache, deleteCache, getCache, CachePrefix } from '../../shared/utils/cache';
import { emailService } from '../notifications/email.service';
import {
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../shared/utils/errors';
import logger from '../../config/logger';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
  tenantId?: string;
}

interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  device?: string;
  ipAddress?: string;
}

interface LoginResult {
  user: Partial<IUser>;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: string;
}

interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: string;
}

export class AuthService {
  // ── Register ──────────────────────────────────────────────────────────────
  async register(input: RegisterInput): Promise<{ user: Partial<IUser>; message: string }> {
    const { name, email, password, phone, role = 'staff', tenantId = 'default' } = input;

    // Check duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate employee ID
    const count = await User.countDocuments({ tenantId });
    const employeeId = `EBA-${String(count + 1).padStart(4, '0')}`;

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role,
      tenantId,
      employeeId,
    });

    // Send verification email (non-blocking)
    try {
      const verifyToken = generateEmailVerificationToken(user._id.toString(), user.email);
      await User.findByIdAndUpdate(user._id, {
        emailVerificationToken: verifyToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await emailService.sendVerificationEmail(user.email, user.name, verifyToken);
    } catch (emailErr) {
      logger.warn(`Failed to send verification email to ${email}: ${(emailErr as Error).message}`);
    }

    logger.info(`New user registered: ${email} (${role}) for tenant ${tenantId}`);

    // Return without sensitive fields
    const { password: _p, ...safeUser } = user.toObject();
    return {
      user: safeUser as Partial<IUser>,
      message: 'Account created successfully. Please check your email to verify your account.',
    };
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(input: LoginInput): Promise<LoginResult> {
    const { email, password, device, ipAddress } = input;

    // Fetch user with password field
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password +loginAttempts +lockUntil +refreshTokens'
    );

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is locked
    if (user.isLocked) {
      const unlockTime = user.lockUntil ? new Date(user.lockUntil).toLocaleTimeString() : 'soon';
      throw new ForbiddenError(`Account temporarily locked due to too many failed attempts. Try again after ${unlockTime}`);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ForbiddenError('Your account has been deactivated. Contact administrator.');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      // Increment failed attempts
      const attempts = user.loginAttempts + 1;
      const LOCK_TIME = 2 * 60 * 60 * 1000;
      const updateData: Record<string, unknown> = { loginAttempts: attempts };
      if (attempts >= 5) {
        updateData.lockUntil = new Date(Date.now() + LOCK_TIME);
      }
      await User.findByIdAndUpdate(user._id, updateData);

      const remaining = Math.max(0, 5 - attempts);
      throw new UnauthorizedError(
        remaining > 0
          ? `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`
          : 'Invalid email or password. Account locked for 2 hours.'
      );
    }

    // Generate tokens
    const tokens = generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    // Store refresh token in user document (keep max 5 sessions)
    const expiresAt = getRefreshTokenExpiry();
    const refreshTokenEntry = {
      token: tokens.refreshToken,
      sessionId: tokens.sessionId,
      device: device ?? 'Unknown',
      ipAddress: ipAddress ?? '',
      createdAt: new Date(),
      expiresAt,
    };

    // Keep only last 5 sessions
    const updatedTokens = [...(user.refreshTokens || []), refreshTokenEntry].slice(-5);

    await User.findByIdAndUpdate(user._id, {
      refreshTokens:  updatedTokens,
      loginAttempts:  0,
      $unset:         { lockUntil: 1 },
      lastLogin:      new Date(),
      lastLoginIp:    ipAddress ?? '',
    });

    // Cache user data
    await setCache(user._id.toString(), {
      userId:    user._id.toString(),
      email:     user.email,
      role:      user.role,
      tenantId:  user.tenantId,
      name:      user.name,
    }, { prefix: CachePrefix.USER, ttl: 900 });

    logger.info(`User logged in: ${email} from ${ipAddress ?? 'unknown'}`);

    const { password: _p, refreshTokens: _rt, ...safeUser } = user.toObject();

    return {
      user: safeUser as Partial<IUser>,
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId:    tokens.sessionId,
      expiresIn:    tokens.expiresIn,
    };
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────
  async refreshToken(token: string): Promise<TokenRefreshResult> {
    const payload = verifyRefreshToken(token);

    // Find user and verify refresh token is in their list
    const user = await User.findById(payload.userId).select('+refreshTokens');
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or account deactivated');
    }

    const tokenEntry = user.refreshTokens.find(
      t => t.token === token && t.sessionId === payload.sessionId
    );

    if (!tokenEntry) {
      // Token reuse detected — invalidate all sessions
      await User.findByIdAndUpdate(user._id, { refreshTokens: [] });
      logger.warn(`Refresh token reuse detected for user ${user.email}. All sessions cleared.`);
      throw new UnauthorizedError('Invalid session. Please login again.');
    }

    if (tokenEntry.expiresAt < new Date()) {
      await User.findByIdAndUpdate(user._id, {
        $pull: { refreshTokens: { sessionId: payload.sessionId } },
      });
      throw new UnauthorizedError('Session expired. Please login again.');
    }

    // Issue new token pair (rotate refresh token)
    const newTokens = generateTokenPair({
      userId:   user._id.toString(),
      email:    user.email,
      role:     user.role,
      tenantId: user.tenantId,
    });

    // Replace old refresh token with new one
    const expiresAt = getRefreshTokenExpiry();
    await User.findByIdAndUpdate(user._id, {
      $pull: { refreshTokens: { sessionId: payload.sessionId } },
    });
    await User.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          token:      newTokens.refreshToken,
          sessionId:  newTokens.sessionId,
          device:     tokenEntry.device,
          ipAddress:  tokenEntry.ipAddress,
          createdAt:  new Date(),
          expiresAt,
        },
      },
    });

    // Blacklist old session
    await setCache(payload.sessionId, true, {
      prefix: CachePrefix.BLACKLIST,
      ttl: 900,
    });

    return {
      accessToken:  newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      sessionId:    newTokens.sessionId,
      expiresIn:    newTokens.expiresIn,
    };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(userId: string, sessionId: string, logoutAll = false): Promise<void> {
    // Blacklist current session
    await setCache(sessionId, true, { prefix: CachePrefix.BLACKLIST, ttl: 900 });

    if (logoutAll) {
      // Invalidate all refresh tokens
      const user = await User.findById(userId).select('+refreshTokens');
      if (user) {
        // Blacklist all sessions
        for (const rt of user.refreshTokens) {
          await setCache(rt.sessionId, true, { prefix: CachePrefix.BLACKLIST, ttl: 900 });
        }
      }
      await User.findByIdAndUpdate(userId, { refreshTokens: [] });
      await deleteCache(userId, CachePrefix.USER);
    } else {
      await User.findByIdAndUpdate(userId, {
        $pull: { refreshTokens: { sessionId } },
      });
    }

    logger.info(`User ${userId} logged out (session: ${sessionId}, all: ${logoutAll})`);
  }

  // ── Verify Email ───────────────────────────────────────────────────────────
  async verifyEmail(token: string): Promise<void> {
    const { userId } = verifyEmailVerificationToken(token);

    const user = await User.findById(userId).select('+emailVerificationToken +emailVerificationExpires');
    if (!user) throw new NotFoundError('User');

    if (user.isEmailVerified) {
      throw new BadRequestError('Email is already verified');
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new UnauthorizedError('Email verification link has expired. Please request a new one.');
    }

    await User.findByIdAndUpdate(userId, {
      isEmailVerified: true,
      $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
    });

    logger.info(`Email verified for user ${userId}`);
  }

  // ── Resend Verification Email ──────────────────────────────────────────────
  async resendVerificationEmail(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Silently succeed to prevent email enumeration
      return;
    }

    if (user.isEmailVerified) {
      throw new BadRequestError('Email is already verified');
    }

    const verifyToken = generateEmailVerificationToken(user._id.toString(), user.email);
    await User.findByIdAndUpdate(user._id, {
      emailVerificationToken: verifyToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await emailService.sendVerificationEmail(user.email, user.name, verifyToken);
  }

  // ── Forgot Password ────────────────────────────────────────────────────────
  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond with success (prevent email enumeration)
    if (!user) return;

    const resetToken = generatePasswordResetToken(user._id.toString(), user.email);
    const hashedToken = hashOTP(resetToken); // Store hashed in DB

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);

    logger.info(`Password reset email sent to ${email}`);
  }

  // ── Reset Password ─────────────────────────────────────────────────────────
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { userId } = verifyPasswordResetToken(token);

    const user = await User.findById(userId).select('+passwordResetToken +passwordResetExpires');
    if (!user) throw new NotFoundError('User');

    if (!user.passwordResetToken || !user.passwordResetExpires) {
      throw new UnauthorizedError('Password reset link is invalid or has expired');
    }

    if (user.passwordResetExpires < new Date()) {
      await User.findByIdAndUpdate(userId, {
        $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
      });
      throw new UnauthorizedError('Password reset link has expired. Please request a new one.');
    }

    const hashedPassword = await hashPassword(newPassword);

    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      refreshTokens: [], // Invalidate all sessions
      $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
      loginAttempts: 0,
      $unsetLock: { lockUntil: 1 },
    });

    // Notify user
    await emailService.sendPasswordChangedEmail(user.email, user.name);

    logger.info(`Password reset completed for user ${userId}`);
  }

  // ── Change Password ────────────────────────────────────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User');

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) throw new UnauthorizedError('Current password is incorrect');

    if (currentPassword === newPassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    const hashedPassword = await hashPassword(newPassword);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    await emailService.sendPasswordChangedEmail(user.email, user.name);

    logger.info(`Password changed for user ${userId}`);
  }

  // ── Send OTP ───────────────────────────────────────────────────────────────
  async sendOTP(
    userId: string,
    purpose: 'phone_verify' | 'login' | 'password_reset'
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (!user.phone) throw new BadRequestError('No phone number on file');

    const { otp, hashedOtp, expiresAt } = generateOTPWithHash();

    await User.findByIdAndUpdate(userId, {
      otp: hashedOtp,
      otpExpires: expiresAt,
      otpPurpose: purpose,
    });

    // Send SMS via Twilio (non-blocking)
    try {
      const { smsService } = await import('../notifications/sms.service');
      await smsService.sendOTP(user.phone, otp);
    } catch (err) {
      logger.warn(`SMS OTP send failed for ${userId}: ${(err as Error).message}`);
    }

    logger.info(`OTP sent to user ${userId} for purpose: ${purpose}`);
  }

  // ── Verify OTP ──────────────────────────────────────────────────────────────
  async verifyOTPCode(
    userId: string,
    otpCode: string,
    purpose: 'phone_verify' | 'login' | 'password_reset'
  ): Promise<boolean> {
    const user = await User.findById(userId).select('+otp +otpExpires +otpPurpose');
    if (!user) throw new NotFoundError('User');

    if (!user.otp || !user.otpExpires) {
      throw new BadRequestError('No OTP found. Please request a new one.');
    }

    if (user.otpExpires < new Date()) {
      throw new UnauthorizedError('OTP has expired. Please request a new one.');
    }

    if (user.otpPurpose !== purpose) {
      throw new BadRequestError('OTP purpose mismatch');
    }

    const isValid = verifyOTP(otpCode, user.otp);
    if (!isValid) throw new UnauthorizedError('Invalid OTP code');

    // Clear OTP
    const updates: Record<string, unknown> = {
      $unset: { otp: 1, otpExpires: 1, otpPurpose: 1 },
    };

    if (purpose === 'phone_verify') {
      (updates.$set as Record<string, unknown>) = { isPhoneVerified: true };
    }

    await User.findByIdAndUpdate(userId, updates);

    return true;
  }

  // ── Set PIN ─────────────────────────────────────────────────────────────────
  async setPin(userId: string, currentPassword: string, pin: string): Promise<void> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User');

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) throw new UnauthorizedError('Current password is incorrect');

    const hashedPin = await hashPassword(pin);
    const pinExpiresAt = new Date();
    pinExpiresAt.setDate(pinExpiresAt.getDate() + 90); // PIN expires in 90 days

    await User.findByIdAndUpdate(userId, {
      pin: hashedPin,
      pinExpiresAt,
    });

    logger.info(`PIN set for user ${userId}`);
  }

  // ── PIN Login ───────────────────────────────────────────────────────────────
  async loginWithPin(
    pin: string,
    userId?: string,
    ipAddress?: string
  ): Promise<LoginResult> {
    let user: IUser | null = null;

    if (userId) {
      user = await User.findById(userId).select('+pin +pinExpiresAt +refreshTokens');
    }

    if (!user) throw new NotFoundError('User');
    if (!user.pin) throw new BadRequestError('PIN not set for this user. Please login with password.');
    if (!user.isActive) throw new ForbiddenError('Account deactivated');

    if (user.pinExpiresAt && user.pinExpiresAt < new Date()) {
      throw new UnauthorizedError('PIN has expired. Please login with password and set a new PIN.');
    }

    const isValidPin = await comparePassword(pin, user.pin);
    if (!isValidPin) throw new UnauthorizedError('Invalid PIN');

    const tokens = generateTokenPair({
      userId:   user._id.toString(),
      email:    user.email,
      role:     user.role,
      tenantId: user.tenantId,
    });

    const expiresAt = getRefreshTokenExpiry();
    await User.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          token:      tokens.refreshToken,
          sessionId:  tokens.sessionId,
          device:     'POS Terminal',
          ipAddress:  ipAddress ?? '',
          createdAt:  new Date(),
          expiresAt,
        },
      },
      lastLogin: new Date(),
    });

    const { pin: _pin, refreshTokens: _rt, ...safeUser } = user.toObject();

    return {
      user: safeUser as Partial<IUser>,
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId:    tokens.sessionId,
      expiresIn:    tokens.expiresIn,
    };
  }

  // ── Get active sessions ──────────────────────────────────────────────────
  async getActiveSessions(userId: string) {
    const user = await User.findById(userId).select('+refreshTokens');
    if (!user) throw new NotFoundError('User');

    return user.refreshTokens
      .filter(t => t.expiresAt > new Date())
      .map(t => ({
        sessionId: t.sessionId,
        device:    t.device,
        ipAddress: t.ipAddress,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      }));
  }

  // ── Revoke session ───────────────────────────────────────────────────────
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: { sessionId } },
    });
    await setCache(sessionId, true, { prefix: CachePrefix.BLACKLIST, ttl: 900 });
  }
}

export const authService = new AuthService();
