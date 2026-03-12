import mongoose from 'mongoose';
import env from './env';
import logger from './logger';

interface ConnectionState {
  isConnected: boolean;
  retryCount: number;
  maxRetries: number;
}

const state: ConnectionState = {
  isConnected: false,
  retryCount: 0,
  maxRetries: 5,
};

const RETRY_DELAY_MS = 5000;

async function connectDB(): Promise<void> {
  if (state.isConnected) {
    logger.info('MongoDB: Using existing connection');
    return;
  }

  const mongooseOptions: mongoose.ConnectOptions = {
    dbName: env.DB_NAME,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    compressors: ['zlib'],
  };

  try {
    logger.info(`MongoDB: Connecting to ${env.DB_NAME}…`);
    await mongoose.connect(env.MONGODB_URI, mongooseOptions);

    state.isConnected = true;
    state.retryCount = 0;

    logger.info('MongoDB: Connected successfully ✓');
  } catch (error) {
    state.retryCount++;
    const errMessage = error instanceof Error ? error.message : String(error);

    logger.error(`MongoDB: Connection failed (attempt ${state.retryCount}/${state.maxRetries}): ${errMessage}`);

    if (state.retryCount < state.maxRetries) {
      logger.info(`MongoDB: Retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return connectDB();
    }

    logger.error('MongoDB: Max retries reached. Exiting.');
    process.exit(1);
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────
mongoose.connection.on('connected', () => {
  state.isConnected = true;
  logger.info('MongoDB: Connection established');
});

mongoose.connection.on('error', (err: Error) => {
  state.isConnected = false;
  logger.error(`MongoDB: Connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  state.isConnected = false;
  logger.warn('MongoDB: Disconnected');

  if (env.NODE_ENV !== 'test') {
    logger.info('MongoDB: Attempting to reconnect…');
    setTimeout(connectDB, RETRY_DELAY_MS);
  }
});

mongoose.connection.on('reconnected', () => {
  state.isConnected = true;
  logger.info('MongoDB: Reconnected successfully');
});

async function disconnectDB(): Promise<void> {
  if (!state.isConnected) return;
  await mongoose.disconnect();
  state.isConnected = false;
  logger.info('MongoDB: Disconnected gracefully');
}

function getConnectionState(): boolean {
  return state.isConnected;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});

export { connectDB, disconnectDB, getConnectionState };
