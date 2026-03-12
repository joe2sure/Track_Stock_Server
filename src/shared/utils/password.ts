import bcrypt from 'bcryptjs';
import env from '../../config/env';

async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, env.BCRYPT_SALT_ROUNDS);
}

async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
  score: number;
} {
  const errors: string[] = [];
  let score = 0;

  if (password.length < 8) errors.push('Password must be at least 8 characters');
  else score++;

  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  else score++;

  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  else score++;

  if (!/\d/.test(password)) errors.push('Password must contain at least one number');
  else score++;

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  } else {
    score++;
  }

  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  return {
    isValid: errors.length === 0,
    errors,
    score, // 0-7
  };
}

export { hashPassword, comparePassword, validatePasswordStrength };
