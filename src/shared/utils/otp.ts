import crypto from 'crypto';
import env from '../../config/env';

interface OTPResult {
  otp: string;
  hashedOtp: string;
  expiresAt: Date;
}

function generateOTP(length = env.OTP_LENGTH): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateOTPWithHash(length = env.OTP_LENGTH): OTPResult {
  const otp = generateOTP(length);
  const hashedOtp = hashOTP(otp);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000);

  return { otp, hashedOtp, expiresAt };
}

function verifyOTP(plainOtp: string, hashedOtp: string): boolean {
  const hashed = hashOTP(plainOtp);
  return crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(hashedOtp));
}

function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export {
  generateOTP,
  hashOTP,
  generateOTPWithHash,
  verifyOTP,
  generateSecureToken,
  OTPResult,
};
