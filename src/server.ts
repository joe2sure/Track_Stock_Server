import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import createApp from './app';
import { connectDB } from './config/database';
import env from './config/env';
import logger from './config/logger';

let server: http.Server;
let io: SocketIOServer;

async function bootstrap(): Promise<void> {
  // 1. Connect to database
  await connectDB();

  // 2. Create Express app
  const app = createApp();

  // 3. Create HTTP server
  server = http.createServer(app);

  // 4. Attach Socket.IO
  io = new SocketIOServer(server, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const { verifyAccessToken } = await import('./shared/utils/jwt');
      const payload = verifyAccessToken(token);

      socket.data.user = payload;
      socket.join(`tenant:${payload.tenantId}`);
      socket.join(`user:${payload.userId}`);

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', socket => {
    const user = socket.data.user as { userId: string; email: string; tenantId: string };
    logger.info(`WebSocket connected: ${user?.email ?? 'unknown'} (${socket.id})`);

    socket.on('disconnect', reason => {
      logger.info(`WebSocket disconnected: ${socket.id} — ${reason}`);
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Join specific rooms based on role
    socket.on('join:room', (room: string) => {
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined room: ${room}`);
    });
  });

  // Export io for use in other modules
  setSocketIO(io);

  // 5. Start listening
  server.listen(env.PORT, () => {
    logger.info(`
╔══════════════════════════════════════════════════════════╗
║        🏪 TrackStock Inventory API — Server Started          ║
╠══════════════════════════════════════════════════════════╣
║  Environment : ${env.NODE_ENV.padEnd(40)}║
║  Port        : ${String(env.PORT).padEnd(40)}║
║  API Base    : ${`/api/${env.API_VERSION}`.padEnd(40)}║
║  Swagger     : ${`/api/${env.API_VERSION}/docs`.padEnd(40)}║
║  Health      : ${`/api/${env.API_VERSION}/health`.padEnd(40)}║
╚══════════════════════════════════════════════════════════╝
    `.trim());
  });

  // 6. Graceful shutdown
  setupGracefulShutdown();
}

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);

    if (io) {
      io.close(() => logger.info('Socket.IO closed'));
    }

    server.close(async () => {
      logger.info('HTTP server closed');
      const { disconnectDB } = await import('./config/database');
      await disconnectDB();
      logger.info('Database connection closed');
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit after 30s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection:', reason);
    if (env.NODE_ENV === 'production') {
      void shutdown('unhandledRejection');
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
    void shutdown('uncaughtException');
  });
}

// ── Socket.IO singleton ────────────────────────────────────────────────────
let _io: SocketIOServer | null = null;

export function setSocketIO(socketIo: SocketIOServer): void {
  _io = socketIo;
}

export function getSocketIO(): SocketIOServer | null {
  return _io;
}

// ── Emit events helper ─────────────────────────────────────────────────────
export function emitToTenant(tenantId: string, event: string, data: unknown): void {
  if (_io) {
    _io.to(`tenant:${tenantId}`).emit(event, {
      ...((typeof data === 'object' ? data : { data }) as object),
      timestamp: new Date().toISOString(),
    });
  }
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  if (_io) {
    _io.to(`user:${userId}`).emit(event, {
      ...((typeof data === 'object' ? data : { data }) as object),
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
bootstrap().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { io };
