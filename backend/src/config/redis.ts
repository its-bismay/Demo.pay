import { Redis } from 'ioredis';
import { env } from '../env';

export const isRedisPlaceholder =
  env.NODE_ENV === 'development' ||
  env.REDIS_URL.includes('localhost') ||
  env.REDIS_URL.includes('dev_placeholder') ||
  !env.REDIS_URL;

export const redis = new Redis(isRedisPlaceholder ? 'redis://127.0.0.1:6379' : env.REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 3000,
  tls:
    !isRedisPlaceholder && env.REDIS_URL.startsWith('rediss://')
      ? { rejectUnauthorized: false }
      : undefined,
  retryStrategy: () => null,
  enableOfflineQueue: false,
  lazyConnect: true,
});

redis.on('error', () => {});
