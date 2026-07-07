import { Errors } from './errors';
import { getRedisClient } from './redis';

type Bucket = { count: number; reset_at: number };

const localBuckets = new Map<string, Bucket>();
const localExpiringKeys = new Map<string, number>();

function buildKey(kind: string, parts: string[]): string {
  return ['hireapp', 'otp', kind, ...parts.map((part) => part.replaceAll(':', '_'))].join(':');
}

function localTtlMs(key: string): number {
  const expiresAt = localExpiringKeys.get(key);
  if (!expiresAt) return -2;
  const ttl = expiresAt - Date.now();
  if (ttl <= 0) {
    localExpiringKeys.delete(key);
    return -2;
  }
  return ttl;
}

async function redisPttl(key: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) {
    ensureLocalFallbackAllowed();
    return localTtlMs(key);
  }
  try {
    return redis.pttl(key);
  } catch {
    throw Errors.internal('OTP state store is unavailable.', 'OTP_STATE_UNAVAILABLE');
  }
}

export async function consumeOtpRateLimit(keyParts: string[], max: number, windowMs: number): Promise<void> {
  const key = buildKey('rate', keyParts);
  const redis = getRedisClient();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      if (count > max) {
        const ttl = await redis.pttl(key);
        throw Errors.tooMany('Too many OTP requests. Please try again later.', 'OTP_RATE_LIMITED', {
          retry_after_seconds: Math.max(1, Math.ceil(ttl / 1000)),
        });
      }
      return;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw Errors.internal('OTP state store is unavailable.', 'OTP_STATE_UNAVAILABLE');
    }
  }

  ensureLocalFallbackAllowed();
  const now = Date.now();
  const current = localBuckets.get(key);
  if (!current || current.reset_at <= now) {
    localBuckets.set(key, { count: 1, reset_at: now + windowMs });
    return;
  }

  if (current.count >= max) {
    throw Errors.tooMany('Too many OTP requests. Please try again later.', 'OTP_RATE_LIMITED', {
      retry_after_seconds: Math.ceil((current.reset_at - now) / 1000),
    });
  }

  current.count += 1;
}

export async function assertOtpCooldown(phone: string, purpose: string): Promise<void> {
  const key = buildKey('cooldown', [phone, purpose]);
  const ttl = await redisPttl(key);
  if (ttl > 0) {
    throw Errors.tooMany('Please wait before requesting another OTP.', 'OTP_COOLDOWN', {
      retry_after_seconds: Math.max(1, Math.ceil(ttl / 1000)),
    });
  }
}

export async function setOtpCooldown(phone: string, purpose: string, ttlMs: number): Promise<void> {
  const key = buildKey('cooldown', [phone, purpose]);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.psetex(key, ttlMs, '1');
      return;
    } catch {
      throw Errors.internal('OTP state store is unavailable.', 'OTP_STATE_UNAVAILABLE');
    }
  }

  ensureLocalFallbackAllowed();
  localExpiringKeys.set(key, Date.now() + ttlMs);
}

export async function assertOtpNotBlocked(phone: string, purpose: string): Promise<void> {
  const key = buildKey('blocked', [phone, purpose]);
  const ttl = await redisPttl(key);
  if (ttl > 0) {
    throw Errors.tooMany('Too many failed OTP attempts. Please try again later.', 'OTP_BLOCKED', {
      retry_after_seconds: Math.max(1, Math.ceil(ttl / 1000)),
    });
  }
}

export async function blockOtp(phone: string, purpose: string, ttlMs: number): Promise<void> {
  const key = buildKey('blocked', [phone, purpose]);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.psetex(key, ttlMs, '1');
      return;
    } catch {
      throw Errors.internal('OTP state store is unavailable.', 'OTP_STATE_UNAVAILABLE');
    }
  }

  ensureLocalFallbackAllowed();
  localExpiringKeys.set(key, Date.now() + ttlMs);
}

function ensureLocalFallbackAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw Errors.internal('OTP state store is unavailable in production.', 'OTP_STATE_UNAVAILABLE');
  }
}
