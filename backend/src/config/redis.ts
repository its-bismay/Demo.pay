import { Redis } from 'ioredis';
import { env } from '../env';

export const isRedisPlaceholder =
  env.REDIS_URL.includes('localhost') ||
  env.REDIS_URL.includes('dev_placeholder') ||
  !env.REDIS_URL;

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls:
    env.REDIS_URL.startsWith('rediss://') && !env.REDIS_URL.includes('localhost')
      ? { rejectUnauthorized: false }
      : undefined,
  retryStrategy(times) {
    if (isRedisPlaceholder || times > 1) return null;
    return 1000;
  },
  enableOfflineQueue: false,
  lazyConnect: true,
});

redis.on('error', () => {});
