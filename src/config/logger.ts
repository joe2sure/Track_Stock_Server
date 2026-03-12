import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import env from './env';

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  let log = `${ts} [${level}]: ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  return log;
});

// Create log directory
const logDir = path.resolve(process.cwd(), env.LOG_DIR);

// File transport for all logs (rotated daily)
const fileTransportAll = new DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

// File transport for errors only
const fileTransportError = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '90d',
  level: 'error',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

// File transport for HTTP access logs
const fileTransportHttp = new DailyRotateFile({
  filename: path.join(logDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '14d',
  level: 'http',
  format: combine(timestamp(), json()),
});

const transports: winston.transport[] = [fileTransportAll, fileTransportError, fileTransportHttp];

// Console transport in non-production
if (env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        splat(),
        consoleFormat
      ),
    })
  );
}

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'ebeano-api' },
  transports,
  exitOnError: false,
});

// Morgan stream for HTTP logging
const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export { logger, morganStream };
export default logger;
