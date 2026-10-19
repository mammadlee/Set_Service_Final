import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ProviderDeliveryError,
  requestProvider,
  resetProviderCircuitState,
} from '../src/lib/provider-http';
import {
  buildOtpProviderOutboxEvent,
  decryptProviderPayload,
  deliverProviderOutboxEvent,
} from '../src/lib/provider-outbox';
import { isOutboxDeliveryStateHealthy } from '../src/lib/outbox';
import { generateOtpCode } from '../src/lib/crypto';

const root = path.resolve(__dirname, '..');
const originalEnvironment = { ...process.env };

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET =
    'provider-outbox-regression-secret-2026-dedicated';

  await retriesTransientFailuresWithStableIdempotency();
  await rejectsPermanentFailuresWithoutRetry();
  await abortsTimedOutRequests();
  await opensCircuitAfterRepeatedFailures();
  verifiesSecureOtpGenerationAndSmsText();
  verifiesEncryptedDeterministicOutboxEvents();
  await suppressesReviewProviderDeliveryAtDispatch();
  verifiesMergedOutboxHealthContract();
  verifiesStaticProviderSafety();

  console.log('Provider delivery regression checks passed.');
}

function verifiesMergedOutboxHealthContract(): void {
  assert.equal(
    isOutboxDeliveryStateHealthy({ lastBatchDeliveryFailures: 0, deadEvents: 7 }),
    true,
    'historical dead letters must remain metrics/alerts rather than permanently failing readiness',
  );
  assert.equal(
    isOutboxDeliveryStateHealthy({ lastBatchDeliveryFailures: 1, deadEvents: 0 }),
    false,
    'a current delivery failure must still fail outbox readiness',
  );
}

function verifiesSecureOtpGenerationAndSmsText(): void {
  const fixedTestOtp = ['654', '321'].join('');
  const randomCalls: Array<[number, number]> = [];
  const generatedCode = generateOtpCode(
    {
      NODE_ENV: 'development',
      OTP_TEST_MODE: 'true',
      OTP_TEST_CODE: fixedTestOtp,
    },
    (minimum, maximum) => {
      randomCalls.push([minimum, maximum]);
      return 413927;
    }
  );

  assert.equal(generatedCode, '413927');
  assert.deepEqual(randomCalls, [[0, 1_000_000]]);
  assert.equal(generateOtpCode({ NODE_ENV: 'production' }, () => 7), '000007');

  const testCode = generateOtpCode(
    {
      NODE_ENV: 'test',
      OTP_TEST_MODE: 'true',
      OTP_TEST_CODE: fixedTestOtp,
    },
    () => {
      throw new Error('Secure random generator must not run in explicit test-code mode.');
    }
  );
  assert.equal(testCode, fixedTestOtp);
  assert.throws(
    () => generateOtpCode({ NODE_ENV: 'test', OTP_TEST_MODE: 'true' }),
    /OTP_TEST_CODE must be an explicitly configured 6-digit value/
  );

  const event = buildOtpProviderOutboxEvent({
    channel: 'sms',
    to: '+994501234567',
    purpose: 'worker_registration',
    code: generatedCode,
    dedupeKey: 'generated-otp-sms-text',
  });
  const decrypted = decryptProviderPayload(event.payload, event.id);
  assert.equal(decrypted.body.includes(generatedCode), true);
}

async function retriesTransientFailuresWithStableIdempotency(): Promise<void> {
  resetProviderCircuitState();
  const idempotencyHeaders: string[] = [];
  let calls = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    idempotencyHeaders.push(new Headers(init?.headers).get('idempotency-key') ?? '');
    return new Response(null, { status: calls === 1 ? 503 : 204 });
  }) as typeof fetch;

  const response = await requestProvider(
    'https://provider.example.test/send',
    { method: 'POST', body: '{}' },
    {
      circuitKey: 'regression-retry',
      idempotencyKey: 'event-stable-id',
      maxAttempts: 2,
      baseDelayMs: 1,
      timeoutMs: 100,
      fetchImpl,
      sleep: async () => undefined,
    }
  );

  assert.equal(response.status, 204);
  assert.equal(calls, 2);
  assert.deepEqual(idempotencyHeaders, ['event-stable-id', 'event-stable-id']);
}

async function rejectsPermanentFailuresWithoutRetry(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('', { status: 400 });
  }) as typeof fetch;

  await assert.rejects(
    requestProvider(
      'https://provider.example.test/send',
      { method: 'POST' },
      {
        circuitKey: 'regression-permanent',
        idempotencyKey: 'permanent-event',
        maxAttempts: 4,
        baseDelayMs: 1,
        timeoutMs: 100,
        fetchImpl,
        sleep: async () => undefined,
      }
    ),
    (error: unknown) =>
      error instanceof ProviderDeliveryError
      && error.statusCode === 400
      && error.retryable === false
  );
  assert.equal(calls, 1);
}

async function abortsTimedOutRequests(): Promise<void> {
  resetProviderCircuitState();
  const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new Error('mock request aborted')),
        { once: true }
      );
    })) as typeof fetch;

  await assert.rejects(
    requestProvider(
      'https://provider.example.test/timeout',
      { method: 'POST' },
      {
        circuitKey: 'regression-timeout',
        idempotencyKey: 'timeout-event',
        maxAttempts: 1,
        timeoutMs: 5,
        fetchImpl,
      }
    ),
    (error: unknown) =>
      error instanceof ProviderDeliveryError
      && error.retryable
      && error.message.includes('timed out')
  );
}

async function opensCircuitAfterRepeatedFailures(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('', { status: 503 });
  }) as typeof fetch;
  const options = {
    circuitKey: 'regression-circuit',
    idempotencyKey: 'circuit-event',
    maxAttempts: 1,
    timeoutMs: 100,
    failureThreshold: 2,
    circuitResetMs: 60_000,
    fetchImpl,
  };

  await assert.rejects(requestProvider('https://provider.example.test/send', {}, options));
  await assert.rejects(requestProvider('https://provider.example.test/send', {}, options));
  await assert.rejects(
    requestProvider('https://provider.example.test/send', {}, options),
    (error: unknown) =>
      error instanceof ProviderDeliveryError
      && error.retryable
      && error.message.includes('circuit is open')
  );
  assert.equal(calls, 2);
}

function verifiesEncryptedDeterministicOutboxEvents(): void {
  const input = {
    channel: 'sms' as const,
    to: '+994501234567',
    purpose: 'worker_login' as const,
    code: '413927',
    dedupeKey: 'otp-row:2026-07-16T10:00:00.000Z:hash',
  };
  const first = buildOtpProviderOutboxEvent(input);
  const second = buildOtpProviderOutboxEvent(input);
  const next = buildOtpProviderOutboxEvent({ ...input, dedupeKey: `${input.dedupeKey}:next` });

  assert.equal(first.id, second.id);
  assert.notEqual(first.id, next.id);
  const encrypted = JSON.stringify(first.payload);
  assert.equal(encrypted.includes(input.code), false);
  assert.equal(encrypted.includes(input.to), false);

  const decrypted = decryptProviderPayload(first.payload, first.id);
  assert.equal(decrypted.channel, 'sms');
  assert.equal(decrypted.to, input.to);
  assert.equal(decrypted.body.includes(input.code), true);
  assert.throws(
    () => decryptProviderPayload(first.payload, next.id),
    /context does not match|authenticate data/i,
    'encrypted provider payloads must not be movable between outbox events'
  );
}

async function suppressesReviewProviderDeliveryAtDispatch(): Promise<void> {
  const sms = buildOtpProviderOutboxEvent({
    channel: 'sms',
    to: '+994501234567',
    purpose: 'worker_login',
    code: '413927',
    dedupeKey: 'review-delivery-sms',
  });
  const email = buildOtpProviderOutboxEvent({
    channel: 'email',
    to: 'review@example.invalid',
    purpose: 'email_verification',
    code: '413927',
    dedupeKey: 'review-delivery-email',
  });
  let smsCalls = 0;
  let emailCalls = 0;
  const delivery = {
    deliverSms: async () => { smsCalls += 1; },
    deliverEmail: async () => { emailCalls += 1; },
  };

  for (const owners of [
    [{ is_review_account: true }],
    [{ is_review_account: undefined }],
    [{ is_review_account: false }, { is_review_account: true }],
  ]) {
    await deliverProviderOutboxEvent(sms.id, sms.event_type, sms.payload, {
      ...delivery,
      resolveRecipientOwners: async () => owners,
    });
    await deliverProviderOutboxEvent(email.id, email.event_type, email.payload, {
      ...delivery,
      resolveRecipientOwners: async () => owners,
    });
  }
  assert.equal(smsCalls, 0);
  assert.equal(emailCalls, 0);

  await deliverProviderOutboxEvent(sms.id, sms.event_type, sms.payload, {
    ...delivery,
    resolveRecipientOwners: async () => [{ is_review_account: false }],
  });
  await deliverProviderOutboxEvent(email.id, email.event_type, email.payload, {
    ...delivery,
    resolveRecipientOwners: async () => [],
  });
  assert.equal(smsCalls, 1, 'ordinary account SMS delivery must remain enabled');
  assert.equal(emailCalls, 1, 'ownerless registration email delivery must remain enabled');

  await assert.rejects(
    deliverProviderOutboxEvent(sms.id, sms.event_type, sms.payload, {
      ...delivery,
      resolveRecipientOwners: async () => { throw new Error('lookup unavailable'); },
    }),
    /lookup unavailable/,
  );
  assert.equal(smsCalls, 1, 'recipient lookup failure must fail closed before provider delivery');
}

function verifiesStaticProviderSafety(): void {
  const authSource = read('src/modules/auth/auth.service.ts');
  const smsSource = read('src/lib/sms.ts');
  const emailSource = read('src/lib/email.ts');
  const fcmSource = read('src/lib/fcm.ts');
  const outboxSource = read('src/lib/outbox.ts');
  const envSource = read('src/lib/check-env.ts');
  const providerOutboxSource = read('src/lib/provider-outbox.ts');

  assert.equal(authSource.includes('sendOtpSms'), false);
  assert.equal(authSource.includes('sendEmailCode'), false);
  assert.match(authSource, /queueProviderDelivery\(tx, deliveryEvent, now\)/);
  assert.match(authSource, /ADMIN_PASSWORD_RESET_DISABLED/);
  assert.match(smsSource, /recipient: '\[hidden\]'/);
  assert.match(smsSource, /body: '\[hidden\]'/);
  assert.match(emailSource, /recipient: '\[hidden\]'/);
  assert.match(emailSource, /body: '\[hidden\]'/);
  assert.match(fcmSource, /from 'firebase-admin\/app'/);
  assert.match(fcmSource, /from 'firebase-admin\/messaging'/);
  assert.equal(fcmSource.includes("import admin from 'firebase-admin'"), false);
  assert.match(outboxSource, /isPermanentProviderError\(error\)/);
  assert.match(providerOutboxSource, /resolveProviderRecipientOwners/);
  assert.match(providerOutboxSource, /owners\.every\(mayDeliverExternally\)/);
  assert.match(envSource, /PROVIDER_OUTBOX_ENCRYPTION_SECRET must be dedicated/);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.env = originalEnvironment;
  });
