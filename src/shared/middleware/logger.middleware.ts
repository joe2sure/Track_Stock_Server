import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { morganStream } from '../../config/logger';

// Morgan HTTP format
const morganFormat =
  process.env.NODE_ENV === 'production'
    ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
    : ':method :url :status :response-time ms - :res[content-length]';

export const httpLogger = morgan(morganFormat, {
  stream: morganStream,
  skip: (req: Request) => req.url === '/health' || req.url === '/api/v1/health',
});

// Request ID middleware — attaches unique ID to each request for tracing
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// Response time header
export function responseTime(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  next();
}
