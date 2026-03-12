import NodeCache from 'node-cache';
import logger from '../../config/logger';

// In-memory cache with TTL support — Redis can replace this in production
const memCache = new NodeCache({
  stdTTL: 300,        // 5 minutes default TTL
  checkperiod: 60,    // Check for expired keys every 60s
  useClones: false,   // Faster, but caller must not mutate returned objects
  maxKeys: 5000,
});

memCache.on('expired', (key: string) => {
  logger.debug(`Cache: Key expired — ${key}`);
});

interface CacheOptions {
  ttl?: number;        // seconds
  prefix?: string;
}

function buildKey(key: string, prefix?: string): string {
  return prefix ? `${prefix}:${key}` : key;
}

async function getCache<T>(key: string, prefix?: string): Promise<T | undefined> {
  const fullKey = buildKey(key, prefix);
  const value = memCache.get<T>(fullKey);
  return value;
}

async function setCache<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
  const fullKey = buildKey(key, options.prefix);
  const ttl = options.ttl ?? 300;
  return memCache.set(fullKey, value, ttl);
}

async function deleteCache(key: string, prefix?: string): Promise<void> {
  const fullKey = buildKey(key, prefix);
  memCache.del(fullKey);
}

async function deleteCachePattern(pattern: string): Promise<void> {
  const keys = memCache.keys().filter(k => k.includes(pattern));
  if (keys.length > 0) {
    memCache.del(keys);
    logger.debug(`Cache: Deleted ${keys.length} keys matching "${pattern}"`);
  }
}

async function flushCache(): Promise<void> {
  memCache.flushAll();
  logger.info('Cache: Flushed all keys');
}

async function getOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = await getCache<T>(key, options.prefix);
  if (cached !== undefined) return cached;

  const value = await factory();
  await setCache(key, value, options);
  return value;
}

function getCacheStats() {
  return memCache.getStats();
}

// Commonly used cache prefixes
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

export {
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  flushCache,
  getOrSet,
  getCacheStats,
  CachePrefix,
};
