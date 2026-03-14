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

// Response time header — hooks into writeHead so the header is set BEFORE
// the response is sent. Using res.on('finish') is wrong because finish fires
// after headers are already flushed, causing "Cannot set headers after they
// are sent to the client" which crashes the server via uncaughtException.
export function responseTime(_req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Wrap writeHead — called right before headers are flushed to the client
  const originalWriteHead = res.writeHead.bind(res) as typeof res.writeHead;
  (res.writeHead as unknown) = function (
    this: Response,
    statusCode: number,
    ...args: unknown[]
  ) {
    // Only set if headers haven't gone out yet (defensive guard)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
    }
    return (originalWriteHead as (...a: unknown[]) => unknown)(statusCode, ...args);
  };

  next();
}



// import { Request, Response, NextFunction } from 'express';
// import morgan from 'morgan';
// import { morganStream } from '../../config/logger';

// // Morgan HTTP format
// const morganFormat =
//   process.env.NODE_ENV === 'production'
//     ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
//     : ':method :url :status :response-time ms - :res[content-length]';

// export const httpLogger = morgan(morganFormat, {
//   stream: morganStream,
//   skip: (req: Request) => req.url === '/health' || req.url === '/api/v1/health',
// });

// // Request ID middleware — attaches unique ID to each request for tracing
// export function requestId(req: Request, res: Response, next: NextFunction): void {
//   const id = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//   req.headers['x-request-id'] = id;
//   res.setHeader('X-Request-ID', id);
//   next();
// }

// // Response time header
// export function responseTime(req: Request, res: Response, next: NextFunction): void {
//   const start = Date.now();
//   res.on('finish', () => {
//     const duration = Date.now() - start;
//     res.setHeader('X-Response-Time', `${duration}ms`);
//   });
//   next();
// }
