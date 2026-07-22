import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type Redis from 'ioredis';
import { Errors } from '../lib/errors';
import { getRedisClient } from '../lib/redis';

export interface RateLimitResult {
  count: number;
  reset_at: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult>;
}

export interface RateLimitConfig {
  scope: string;
  windowMs: number;
  max: number;
  dimensions: Array<'ip' | 'actor' | 'target'>;
  target?: (req: Request) => string | undefined;
  store?: RateLimitStore;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, RateLimitResult>();

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (!existing || existing.reset_at <= now) {
      const next = { count: 1, reset_at: now + windowMs };
      this.entries.set(key, next);
      return { ...next };
    }

    existing.count += 1;
    return { ...existing };
  }

  clear(): void {
    this.entries.clear();
  }
}

const memoryStore = new MemoryRateLimitStore();

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const result = await this.redis.eval(
      [
        "local current = redis.call('INCR', KEYS[1])",
        "if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
        "local ttl = redis.call('PTTL', KEYS[1])",
        'return {current, ttl}',
      ].join('\n'),
      1,
      key,
      String(windowMs)
    ) as [number, number];

    const ttl = Math.max(Number(result[1]), 0);
    return {
      count: Number(result[0]),
      reset_at: Date.now() + ttl,
    };
  }
}

export function createRateLimitMiddleware(config: RateLimitConfig): RequestHandler {
  return (req, res, next) => {
    void enforceRateLimit(req, res, config).then(() => next()).catch(next);
  };
}

export async function enforceActorRateLimit(req: Request, res: Response): Promise<void> {
  await enforceRateLimit(req, res, {
    scope: 'authenticated_actor',
    windowMs: intEnv('RATE_LIMIT_ACTOR_WINDOW_MS', 15 * 60 * 1000),
    max: intEnv('RATE_LIMIT_ACTOR_MAX', 600),
    dimensions: ['actor'],
  });
}

export async function enforceRateLimit(
  req: Request,
  res: Response,
  config: RateLimitConfig
): Promise<void> {
  const store = config.store ?? defaultStore();
  const keys = buildDimensionKeys(req, config);
  if (keys.length === 0) return;

  let results: RateLimitResult[];
  try {
    results = await Promise.all(keys.map((key) => store.increment(key, config.windowMs)));
  } catch {
    if (process.env.NODE_ENV === 'production') {
      throw Errors.unavailable(
        'Request rate limiting is temporarily unavailable.',
        'RATE_LIMIT_STORE_UNAVAILABLE'
      );
    }
    results = await Promise.all(keys.map((key) => memoryStore.increment(key, config.windowMs)));
  }

  const mostRestrictive = results.reduce((current, result) =>
    result.count > current.count ? result : current
  );
  const remaining = Math.max(0, config.max - mostRestrictive.count);
  const resetSeconds = Math.max(0, Math.ceil((mostRestrictive.reset_at - Date.now()) / 1000));

  res.setHeader('RateLimit-Limit', String(config.max));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));

  if (results.some((result) => result.count > config.max)) {
    res.setHeader('Retry-After', String(resetSeconds));
    throw Errors.tooMany(
      'Too many requests. Please try again later.',
      'TOO_MANY_REQUESTS',
      { retry_after_seconds: resetSeconds }
    );
  }
}

export function buildDimensionKeys(req: Request, config: RateLimitConfig): string[] {
  const keys: string[] = [];
  for (const dimension of config.dimensions) {
    let value: string | undefined;
    if (dimension === 'ip') value = req.ip;
    if (dimension === 'actor') {
      value = (req as Request & { user?: { sub?: string } }).user?.sub;
    }
    if (dimension === 'target') value = config.target?.(req);
    if (!value) continue;
    keys.push(`setservice:ratelimit:${config.scope}:${dimension}:${digest(value)}`);
  }
  return [...new Set(keys)];
}

export function authTarget(req: Request): string | undefined {
  const body = isRecord(req.body) ? req.body : {};
  const candidate = body.phone ?? body.email ?? body.fcm_token;
  return typeof candidate === 'string' ? candidate.trim().toLowerCase() : undefined;
}

export function kioskTarget(req: Request): string | undefined {
  const capability = req.get('x-kiosk-capability')?.trim();
  if (capability) return capability;
  if (process.env.NODE_ENV === 'production') return undefined;

  const match = req.path.match(/\/(?:kiosk-sessions|venue-kiosks)\/([^/]+)/i);
  return match?.[1];
}

function defaultStore(): RateLimitStore {
  const redis = getRedisClient();
  if (redis) return new RedisRateLimitStore(redis);
  if (process.env.NODE_ENV === 'production') {
    throw Errors.unavailable(
      'Request rate limiting is temporarily unavailable.',
      'RATE_LIMIT_STORE_UNAVAILABLE'
    );
  }
  return memoryStore;
}

function intEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
