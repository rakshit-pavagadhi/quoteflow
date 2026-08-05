import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
let redis: Redis | null = null;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      // Limit retry backoff so it doesn't try endlessly if offline
      return Math.min(times * 100, 2000);
    }
  });

  redis.on('error', (err) => {
    console.warn('Redis connection failed. Caching disabled (database used directly):', err.message);
  });
} else {
  console.warn('REDIS_URL environment variable is missing. Caching is disabled.');
}

/**
 * Gets data from Redis cache or fetches it from database and caches it.
 */
export async function getOrSet(key: string, ttlSeconds: number, fetcher: () => Promise<any>): Promise<any> {
  if (!redis) {
    return await fetcher();
  }

  try {
    const cachedValue = await redis.get(key);
    if (cachedValue) {
      return JSON.parse(cachedValue);
    }

    const freshData = await fetcher();
    if (freshData !== undefined && freshData !== null) {
      await redis.setex(key, ttlSeconds, JSON.stringify(freshData));
    }
    return freshData;
  } catch (err) {
    console.warn(`Redis getOrSet failed for key ${key}:`, err);
    return await fetcher();
  }
}

/**
 * Deletes key patterns (e.g. "quotes:*") from Redis.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn(`Redis cache invalidation failed for pattern ${pattern}:`, err);
  }
}