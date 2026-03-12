import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import env from '../../config/env';
import { TokenPayload } from '../types';
import { UnauthorizedError } from './errors';

interface GenerateTokenOptions {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  expiresIn?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: string;
}

function generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'ebeano-api',
    audience: 'ebeano-client',
  } as jwt.SignOptions);
}

function generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'ebeano-api',
    audience: 'ebeano-client',
  } as jwt.SignOptions);
}

function generateTokenPair(options: GenerateTokenOptions): TokenPair {
  const sessionId = uuidv4();

  const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
    userId: options.userId,
    email: options.email,
    role: options.role as TokenPayload['role'],
    tenantId: options.tenantId,
    sessionId,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'ebeano-api',
      audience: 'ebeano-client',
    }) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired. Please refresh your session.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token. Please login again.');
    }
    throw new UnauthorizedError('Token verification failed.');
  }
}

function verifyRefreshToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: 'ebeano-api',
      audience: 'ebeano-client',
    }) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired. Please login again.');
    }
    throw new UnauthorizedError('Invalid refresh token. Please login again.');
  }
}

function generateEmailVerificationToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, type: 'email_verification' }, env.JWT_EMAIL_VERIFY_SECRET, {
    expiresIn: '24h',
  } as jwt.SignOptions);
}

function verifyEmailVerificationToken(token: string): { userId: string; email: string } {
  try {
    const decoded = jwt.verify(token, env.JWT_EMAIL_VERIFY_SECRET) as {
      userId: string;
      email: string;
      type: string;
    };
    if (decoded.type !== 'email_verification') {
      throw new UnauthorizedError('Invalid token type');
    }
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    throw new UnauthorizedError('Invalid or expired email verification link');
  }
}

function generatePasswordResetToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, type: 'password_reset' }, env.JWT_PASSWORD_RESET_SECRET, {
    expiresIn: '1h',
  } as jwt.SignOptions);
}

function verifyPasswordResetToken(token: string): { userId: string; email: string } {
  try {
    const decoded = jwt.verify(token, env.JWT_PASSWORD_RESET_SECRET) as {
      userId: string;
      email: string;
      type: string;
    };
    if (decoded.type !== 'password_reset') {
      throw new UnauthorizedError('Invalid token type');
    }
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    throw new UnauthorizedError('Invalid or expired password reset link');
  }
}

function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}

function getRefreshTokenExpiry(): Date {
  const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace('d', ''), 10) || 7;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

export {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  decodeToken,
  getRefreshTokenExpiry,
  TokenPair,
};
