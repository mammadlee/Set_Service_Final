import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request, Response } from 'express';
import { AppError } from '../src/lib/errors';
import { logger } from '../src/lib/logger';
import {
  MemoryRateLimitStore,
  authTarget,
  buildDimensionKeys,
  enforceRateLimit,
} from '../src/middleware/rate-limit';
import type { RateLimitConfig } from '../src/middleware/rate-limit';
import {
  configureTrustProxy,
  routeTemplate,
  safeHeaderId,
} from '../src/middleware/request-context';

type HeaderMap = Record<string, string>;

function fakeRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    ip: '203.0.113.10',
    body: {},
    path: '/',
    baseUrl: '',
    ...overrides,
  } as unknown as Request;
}

function fakeResponse(): Response & { headers: HeaderMap } {
  const headers: HeaderMap = {};
  return {
    headers,
    setHeader(name: string, value: number | string | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
      return this;
    },
  } as Response & { headers: HeaderMap };
}

async function testMemoryStoreWindow(): Promise<void> {
  const store = new MemoryRateLimitStore();
  const first = await store.increment('scope:key', 10);
  const second = await store.increment('scope:key', 10);
  assert.equal(first.count, 1);
  assert.equal(second.count, 2);

  await new Promise((resolve) => setTimeout(resolve, 30));
  const rolled = await store.increment('scope:key', 10);
  assert.equal(rolled.count, 1);
  store.clear();
}

async function testRateLimitDimensionsAndEnforcement(): Promise<void> {
  const req = fakeRequest({
    body: { email: 'User@Example.com' },
    user: { sub: 'actor-123' },
  });
  const config: RateLimitConfig = {
    scope: 'auth_regression',
    windowMs: 60_000,
    max: 1,
    dimensions: ['ip', 'actor', 'target'],
    target: authTarget,
    store: new MemoryRateLimitStore(),
  };

  const keys = buildDimensionKeys(req, config);
  assert.equal(keys.length, 3);
  assert.ok(keys.every((key) => /^[\w:-]+:[a-f0-9]{64}$/.test(key)));
  assert.ok(keys.every((key) => !key.includes('User@Example.com')));
  assert.ok(keys.every((key) => !key.includes('actor-123')));
  assert.ok(keys.every((key) => !key.includes('203.0.113.10')));

  const firstResponse = fakeResponse();
  await enforceRateLimit(req, firstResponse, config);
  assert.equal(firstResponse.headers['ratelimit-remaining'], '0');

  const secondResponse = fakeResponse();
  await assert.rejects(
    () => enforceRateLimit(req, secondResponse, config),
    (error: unknown) =>
      error instanceof AppError
      && error.statusCode === 429
      && error.code === 'TOO_MANY_REQUESTS'
  );
  assert.ok(Number(secondResponse.headers['retry-after']) >= 0);
}

async function testProductionFailClosed(): Promise<void> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  process.env.NODE_ENV = 'production';
  delete process.env.REDIS_URL;

  try {
    await assert.rejects(
      () => enforceRateLimit(fakeRequest(), fakeResponse(), {
        scope: 'production_regression',
        windowMs: 60_000,
        max: 1,
        dimensions: ['ip'],
      }),
      (error: unknown) =>
        error instanceof AppError
        && error.statusCode === 503
        && error.code === 'RATE_LIMIT_STORE_UNAVAILABLE'
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
}

function testRequestMetadataSafety(): void {
  assert.equal(safeHeaderId('request-1234'), 'request-1234');
  assert.equal(safeHeaderId('short'), undefined);
  assert.equal(safeHeaderId('request id with spaces'), undefined);
  assert.equal(safeHeaderId('x'.repeat(129)), undefined);

  const route = routeTemplate(fakeRequest({
    path: '/v1/attendance/kiosk-sessions/raw-secret-token/scan',
  }));
  assert.equal(route, '/v1/attendance/kiosk-sessions/:token/scan');

  const calls: Array<[string, unknown]> = [];
  const previous = process.env.TRUST_PROXY_CIDRS;
  delete process.env.TRUST_PROXY_CIDRS;
  configureTrustProxy({ set: (name, value) => calls.push([name, value]) });
  assert.deepEqual(calls.pop(), ['trust proxy', false]);

  process.env.TRUST_PROXY_CIDRS = '10.0.0.0/8, 192.168.0.0/16';
  configureTrustProxy({ set: (name, value) => calls.push([name, value]) });
  assert.deepEqual(calls.pop(), ['trust proxy', ['10.0.0.0/8', '192.168.0.0/16']]);
  if (previous === undefined) delete process.env.TRUST_PROXY_CIDRS;
  else process.env.TRUST_PROXY_CIDRS = previous;
}

function testStructuredLogRedaction(): void {
  const previousLog = console.log;
  let line = '';
  console.log = (value?: unknown) => {
    line = String(value ?? '');
  };

  try {
    logger.info('redaction_regression', {
      authorization: 'Bearer raw-bearer-secret',
      email: 'alice@example.com',
      phone: '+994501234567',
      note: 'otp=123456 password=hunter2',
      database_error: 'postgresql://db-user:database-password@db.example.com/service',
      url_error: '/v1/attendance/kiosk-sessions/raw-kiosk-capability?token=raw-query-token',
      private_key_error: [
        ['-----BEGIN PRIVATE', 'KEY-----'].join(' '),
        'private-key-material',
        ['-----END PRIVATE', 'KEY-----'].join(' '),
      ].join('\n'),
    });
  } finally {
    console.log = previousLog;
  }

  const payload = JSON.parse(line) as Record<string, unknown>;
  assert.equal(payload.message, 'redaction_regression');
  assert.equal(payload.service, 'setservice-api');
  assert.ok(!line.includes('raw-bearer-secret'));
  assert.ok(!line.includes('alice@example.com'));
  assert.ok(!line.includes('+994501234567'));
  assert.ok(!line.includes('123456'));
  assert.ok(!line.includes('hunter2'));
  assert.ok(!line.includes('database-password'));
  assert.ok(!line.includes('raw-kiosk-capability'));
  assert.ok(!line.includes('raw-query-token'));
  assert.ok(!line.includes('private-key-material'));
  assert.ok(line.includes('[redacted]'));
}

function testSmokeFlowDoesNotLogOtpValue(): void {
  const smokeSource = readFileSync(
    resolve(__dirname, 'mvp-flow-smoke.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    smokeSource,
    /console\.(?:log|info|warn|error)\s*\(\s*`[^`]*\$\{TEST_OTP\}/,
    'Smoke verification must never print the OTP value.',
  );
}

async function main(): Promise<void> {
  await testMemoryStoreWindow();
  await testRateLimitDimensionsAndEnforcement();
  await testProductionFailClosed();
  testRequestMetadataSafety();
  testStructuredLogRedaction();
  testSmokeFlowDoesNotLogOtpValue();
  console.log('backend infrastructure regression tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
