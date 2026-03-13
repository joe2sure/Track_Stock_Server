import NodeCache from 'node-cache';
import Redis from 'ioredis';
import logger from '../../config/logger';
import env from '../../config/env';

// ── Commonly used cache prefixes ──────────────────────────────────────────────
const CachePrefix = {
  USER:           'user',
  AUTH:           'auth',
  PRODUCT:        'product',
  CATEGORY:       'category',
  STOCK:          'stock',
  SETTINGS:       'settings',
  ROLES:          'roles',
  CURRENCIES:     'currencies',
  WAREHOUSES:     'warehouses',
  SUPPLIERS:      'suppliers',
  DASHBOARD:      'dashboard',
  REPORT:         'report',
  OTP:            'otp',
  REFRESH_TOKEN:  'refresh_token',
  BLACKLIST:      'blacklist',
} as const;

type CachePrefixValue = typeof CachePrefix[keyof typeof CachePrefix];

interface CacheOptions {
  ttl?:    number;   // seconds (default 300)
  prefix?: string;
}

function buildKey(key: string, prefix?: string): string {
  return prefix ? `${prefix}:${key}` : key;
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIS CLIENT
// ─────────────────────────────────────────────────────────────────────────────
let redisClient: Redis | null = null;
let redisReady  = false;

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    password:             env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    connectTimeout:       10_000,
    lazyConnect:          true,
    retryStrategy: (times: number) => {
      if (times > 5) {
        logger.warn('[Redis] Max retries reached — falling back to in-memory cache');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  });

  client.on('connect',     () => { redisReady = true;  logger.info('[Redis] Connected to Redis Cloud ✅'); });
  client.on('ready',       () => { redisReady = true;  logger.info('[Redis] Client ready'); });
  client.on('error',  (err: Error) => { redisReady = false; logger.error(`[Redis] Error: ${err.message}`); });
  client.on('close',       () => { redisReady = false; logger.warn('[Redis] Connection closed'); });
  client.on('reconnecting',() => { logger.info('[Redis] Reconnecting…'); });

  return client;
}

export async function initRedis(): Promise<void> {
  if (!env.USE_REDIS) {
    logger.info('[Cache] USE_REDIS=false — using in-memory NodeCache');
    return;
  }

  if (!env.REDIS_URL) {
    logger.warn('[Cache] REDIS_URL not set — falling back to in-memory cache');
    return;
  }

  try {
    redisClient = createRedisClient();
    await redisClient.connect();
    await redisClient.ping();
    logger.info('[Redis] Ping successful — Redis Cloud is operational ✅');
  } catch (err) {
    redisReady = false;
    logger.warn(`[Redis] Could not connect (${(err as Error).message}) — falling back to in-memory cache`);
    redisClient = null;
  }
}

export function getRedisClient(): Redis | null {
  return redisReady ? redisClient : null;
}

export function isRedisReady(): boolean {
  return redisReady;
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY FALLBACK (NodeCache)
// ─────────────────────────────────────────────────────────────────────────────
const memCache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false, maxKeys: 5000 });
memCache.on('expired', (key: string) => logger.debug(`[Cache] Key expired — ${key}`));

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED CACHE API — uses Redis when available, NodeCache as fallback
// ─────────────────────────────────────────────────────────────────────────────
async function getCache<T>(key: string, prefix?: string): Promise<T | undefined> {
  const fullKey = buildKey(key, prefix);
  if (redisClient && redisReady) {
    try {
      const raw = await redisClient.get(fullKey);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn(`[Redis] GET error for ${fullKey}: ${(err as Error).message}`);
    }
  }
  return memCache.get<T>(fullKey);
}

async function setCache<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
  const fullKey = buildKey(key, options.prefix);
  const ttl     = options.ttl ?? 300;
  if (redisClient && redisReady) {
    try {
      await redisClient.setex(fullKey, ttl, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.warn(`[Redis] SET error for ${fullKey}: ${(err as Error).message}`);
    }
  }
  return memCache.set(fullKey, value, ttl);
}

async function deleteCache(key: string, prefix?: string): Promise<void> {
  const fullKey = buildKey(key, prefix);
  if (redisClient && redisReady) {
    try { await redisClient.del(fullKey); return; }
    catch (err) { logger.warn(`[Redis] DEL error for ${fullKey}: ${(err as Error).message}`); }
  }
  memCache.del(fullKey);
}

async function deleteCachePattern(pattern: string): Promise<void> {
  if (redisClient && redisReady) {
    try {
      const stream = redisClient.scanStream({ match: `*${pattern}*`, count: 100 });
      const pipeline = redisClient.pipeline();
      let found = 0;
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (keys: string[]) => { if (keys.length) { keys.forEach(k => pipeline.del(k)); found += keys.length; } });
        stream.on('end',   resolve);
        stream.on('error', reject);
      });
      if (found > 0) { await pipeline.exec(); logger.debug(`[Redis] Deleted ${found} keys matching "${pattern}"`); }
      return;
    } catch (err) { logger.warn(`[Redis] Pattern delete error: ${(err as Error).message}`); }
  }
  const keys = memCache.keys().filter(k => k.includes(pattern));
  if (keys.length > 0) { memCache.del(keys); logger.debug(`[Cache] Deleted ${keys.length} keys matching "${pattern}"`); }
}

async function flushCache(): Promise<void> {
  if (redisClient && redisReady) {
    try { await redisClient.flushdb(); logger.info('[Redis] Flushed current database'); return; }
    catch (err) { logger.warn(`[Redis] Flush error: ${(err as Error).message}`); }
  }
  memCache.flushAll();
  logger.info('[Cache] Flushed all in-memory keys');
}

async function getOrSet<T>(key: string, factory: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
  const cached = await getCache<T>(key, options.prefix);
  if (cached !== undefined) return cached;
  const value = await factory();
  await setCache(key, value, options);
  return value;
}

function getCacheStats() {
  return {
    mode:        (redisClient && redisReady) ? 'redis' : 'memory',
    redisReady,
    redisUrl:    env.USE_REDIS ? env.REDIS_URL.replace(/\/\/.*@/, '//***@') : null,
    memoryStats: (!redisClient || !redisReady) ? memCache.getStats() : undefined,
  };
}

export { getCache, setCache, deleteCache, deleteCachePattern, flushCache, getOrSet, getCacheStats, CachePrefix };
export type { CachePrefixValue };





// import NodeCache from 'node-cache';
// import logger from '../../config/logger';

// // In-memory cache with TTL support — Redis can replace this in production
// const memCache = new NodeCache({
//   stdTTL: 300,        // 5 minutes default TTL
//   checkperiod: 60,    // Check for expired keys every 60s
//   useClones: false,   // Faster, but caller must not mutate returned objects
//   maxKeys: 5000,
// });

// memCache.on('expired', (key: string) => {
//   logger.debug(`Cache: Key expired — ${key}`);
// });

// interface CacheOptions {
//   ttl?: number;        // seconds
//   prefix?: string;
// }

// function buildKey(key: string, prefix?: string): string {
//   return prefix ? `${prefix}:${key}` : key;
// }

// async function getCache<T>(key: string, prefix?: string): Promise<T | undefined> {
//   const fullKey = buildKey(key, prefix);
//   const value = memCache.get<T>(fullKey);
//   return value;
// }

// async function setCache<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
//   const fullKey = buildKey(key, options.prefix);
//   const ttl = options.ttl ?? 300;
//   return memCache.set(fullKey, value, ttl);
// }

// async function deleteCache(key: string, prefix?: string): Promise<void> {
//   const fullKey = buildKey(key, prefix);
//   memCache.del(fullKey);
// }

// async function deleteCachePattern(pattern: string): Promise<void> {
//   const keys = memCache.keys().filter(k => k.includes(pattern));
//   if (keys.length > 0) {
//     memCache.del(keys);
//     logger.debug(`Cache: Deleted ${keys.length} keys matching "${pattern}"`);
//   }
// }

// async function flushCache(): Promise<void> {
//   memCache.flushAll();
//   logger.info('Cache: Flushed all keys');
// }

// async function getOrSet<T>(
//   key: string,
//   factory: () => Promise<T>,
//   options: CacheOptions = {}
// ): Promise<T> {
//   const cached = await getCache<T>(key, options.prefix);
//   if (cached !== undefined) return cached;

//   const value = await factory();
//   await setCache(key, value, options);
//   return value;
// }

// function getCacheStats() {
//   return memCache.getStats();
// }

// // Commonly used cache prefixes
// const CachePrefix = {
//   USER:           'user',
//   AUTH:           'auth',
//   PRODUCT:        'product',
//   CATEGORY:       'category',
//   STOCK:          'stock',
//   SETTINGS:       'settings',
//   ROLES:          'roles',
//   CURRENCIES:     'currencies',
//   WAREHOUSES:     'warehouses',
//   SUPPLIERS:      'suppliers',
//   DASHBOARD:      'dashboard',
//   REPORT:         'report',
//   OTP:            'otp',
//   REFRESH_TOKEN:  'refresh_token',
//   BLACKLIST:      'blacklist',
// } as const;

// export {
//   getCache,
//   setCache,
//   deleteCache,
//   deleteCachePattern,
//   flushCache,
//   getOrSet,
//   getCacheStats,
//   CachePrefix,
// };
