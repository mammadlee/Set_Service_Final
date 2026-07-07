import Redis from 'ioredis';
import { logger } from './logger';

let client: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
    });
  }

  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production.');
    }
    logger.warn('REDIS_URL is not configured; using local in-memory OTP state fallback for development.');
    return;
  }

  if (redis.status === 'wait') await redis.connect();
  await redis.ping();
  logger.info('Redis connection is ready');
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
}
