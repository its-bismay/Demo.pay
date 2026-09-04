import { Redis } from 'ioredis';
import { env } from '../env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: env.REDIS_URL.startsWith('rediss://') && !env.REDIS_URL.includes('localhost') ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 1000, 10000);
  },
  enableOfflineQueue: false,
});

redis.on('error', () => {});
