import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_VERSION: string;
  API_BASE_URL: string;

  // Database
  MONGODB_URI: string;
  DB_NAME: string;

  // JWT
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  JWT_EMAIL_VERIFY_SECRET: string;
  JWT_PASSWORD_RESET_SECRET: string;

  // Security
  BCRYPT_SALT_ROUNDS: number;
  COOKIE_SECRET: string;
  ENCRYPTION_KEY: string;

  // CORS
  CORS_ORIGINS: string[];

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  AUTH_RATE_LIMIT_MAX: number;

  // SendGrid
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  SENDGRID_FROM_NAME: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_WHATSAPP_NUMBER: string;

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  CLOUDINARY_UPLOAD_FOLDER: string;

  // Paystack
  PAYSTACK_SECRET_KEY: string;
  PAYSTACK_PUBLIC_KEY: string;
  PAYSTACK_BASE_URL: string;
  PAYSTACK_WEBHOOK_SECRET: string;

  // Redis
  REDIS_URL: string;
  REDIS_PASSWORD: string;
  USE_REDIS: boolean;

  // WebSocket
  WS_PORT: number;
  WS_HEARTBEAT_INTERVAL: number;

  // File Upload
  MAX_FILE_SIZE_MB: number;
  ALLOWED_IMAGE_TYPES: string[];
  ALLOWED_DOC_TYPES: string[];

  // Business Defaults
  DEFAULT_CURRENCY: string;
  DEFAULT_TAX_RATE: number;
  DEFAULT_LOW_STOCK_THRESHOLD: number;
  BUSINESS_NAME: string;

  // Logging
  LOG_LEVEL: string;
  LOG_DIR: string;

  // Pagination
  DEFAULT_PAGE_SIZE: number;
  MAX_PAGE_SIZE: number;

  // OTP
  OTP_EXPIRES_MINUTES: number;
  OTP_LENGTH: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return num;
}

function getEnvBool(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvArray(key: string, defaultValue: string[] = []): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

const env: EnvConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
  PORT: getEnvNumber('PORT', 5000),
  API_VERSION: getEnvVar('API_VERSION', 'v1'),
  API_BASE_URL: getEnvVar('API_BASE_URL', 'http://localhost:5000'),

  // Database
  MONGODB_URI: getEnvVar('MONGODB_URI', 'mongodb://localhost:27017/ebeano-inventory'),
  DB_NAME: getEnvVar('DB_NAME', 'ebeano-inventory'),

  // JWT
  JWT_ACCESS_SECRET: getEnvVar('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production'),
  JWT_REFRESH_SECRET: getEnvVar('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
  JWT_ACCESS_EXPIRES_IN: getEnvVar('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  JWT_EMAIL_VERIFY_SECRET: getEnvVar('JWT_EMAIL_VERIFY_SECRET', 'dev-email-verify-secret'),
  JWT_PASSWORD_RESET_SECRET: getEnvVar('JWT_PASSWORD_RESET_SECRET', 'dev-password-reset-secret'),

  // Security
  BCRYPT_SALT_ROUNDS: getEnvNumber('BCRYPT_SALT_ROUNDS', 12),
  COOKIE_SECRET: getEnvVar('COOKIE_SECRET', 'dev-cookie-secret'),
  ENCRYPTION_KEY: getEnvVar('ENCRYPTION_KEY', 'dev-encryption-key-32-chars-long!!'),

  // CORS
  CORS_ORIGINS: getEnvArray('CORS_ORIGINS', ['http://localhost:3000', 'http://localhost:3001']),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  AUTH_RATE_LIMIT_MAX: getEnvNumber('AUTH_RATE_LIMIT_MAX', 10),

  // SendGrid
  SENDGRID_API_KEY: getEnvVar('SENDGRID_API_KEY', ''),
  SENDGRID_FROM_EMAIL: getEnvVar('SENDGRID_FROM_EMAIL', 'noreply@ebeano.com'),
  SENDGRID_FROM_NAME: getEnvVar('SENDGRID_FROM_NAME', 'Ebeano Inventory'),

  // Twilio
  TWILIO_ACCOUNT_SID: getEnvVar('TWILIO_ACCOUNT_SID', ''),
  TWILIO_AUTH_TOKEN: getEnvVar('TWILIO_AUTH_TOKEN', ''),
  TWILIO_PHONE_NUMBER: getEnvVar('TWILIO_PHONE_NUMBER', ''),
  TWILIO_WHATSAPP_NUMBER: getEnvVar('TWILIO_WHATSAPP_NUMBER', ''),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: getEnvVar('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY: getEnvVar('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: getEnvVar('CLOUDINARY_API_SECRET', ''),
  CLOUDINARY_UPLOAD_FOLDER: getEnvVar('CLOUDINARY_UPLOAD_FOLDER', 'ebeano-inventory'),

  // Paystack
  PAYSTACK_SECRET_KEY: getEnvVar('PAYSTACK_SECRET_KEY', ''),
  PAYSTACK_PUBLIC_KEY: getEnvVar('PAYSTACK_PUBLIC_KEY', ''),
  PAYSTACK_BASE_URL: getEnvVar('PAYSTACK_BASE_URL', 'https://api.paystack.co'),
  PAYSTACK_WEBHOOK_SECRET: getEnvVar('PAYSTACK_WEBHOOK_SECRET', ''),

  // Redis
  REDIS_URL: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
  REDIS_PASSWORD: getEnvVar('REDIS_PASSWORD', ''),
  USE_REDIS: getEnvBool('USE_REDIS', false),

  // WebSocket
  WS_PORT: getEnvNumber('WS_PORT', 5001),
  WS_HEARTBEAT_INTERVAL: getEnvNumber('WS_HEARTBEAT_INTERVAL', 30000),

  // File Upload
  MAX_FILE_SIZE_MB: getEnvNumber('MAX_FILE_SIZE_MB', 10),
  ALLOWED_IMAGE_TYPES: getEnvArray('ALLOWED_IMAGE_TYPES', ['image/jpeg', 'image/png', 'image/webp']),
  ALLOWED_DOC_TYPES: getEnvArray('ALLOWED_DOC_TYPES', ['application/pdf', 'text/csv']),

  // Business Defaults
  DEFAULT_CURRENCY: getEnvVar('DEFAULT_CURRENCY', 'NGN'),
  DEFAULT_TAX_RATE: parseFloat(process.env.DEFAULT_TAX_RATE || '7.5'),
  DEFAULT_LOW_STOCK_THRESHOLD: getEnvNumber('DEFAULT_LOW_STOCK_THRESHOLD', 10),
  BUSINESS_NAME: getEnvVar('BUSINESS_NAME', 'Ebeano Supermarket'),

  // Logging
  LOG_LEVEL: getEnvVar('LOG_LEVEL', 'info'),
  LOG_DIR: getEnvVar('LOG_DIR', 'logs'),

  // Pagination
  DEFAULT_PAGE_SIZE: getEnvNumber('DEFAULT_PAGE_SIZE', 20),
  MAX_PAGE_SIZE: getEnvNumber('MAX_PAGE_SIZE', 100),

  // OTP
  OTP_EXPIRES_MINUTES: getEnvNumber('OTP_EXPIRES_MINUTES', 10),
  OTP_LENGTH: getEnvNumber('OTP_LENGTH', 6),
};

export default env;
export { EnvConfig };
