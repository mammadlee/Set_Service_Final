import assert from 'node:assert/strict';
import {
  loadPG365Config,
  normalizePG365Phone,
  PG365Config,
  PG365SmsProvider,
  SmsProviderException,
} from '../src/lib/sms';
import { resetProviderCircuitState } from '../src/lib/provider-http';

const config: PG365Config = {
  apiUrl: 'https://api.poctgoyercini.com',
  publicKey: '0123456789abcdef',
  privateKey: 'regression-credential-Ax7mQ2vL9pR4tW8y',
  originator: 'SET',
  timeoutMs: 100,
};

const otpText = [
  'SET doğrulama kodunuz: 413927',
  '',
  'Kod 5 dəqiqə etibarlıdır.',
  'Heç kimlə paylaşmayın.',
].join('\n');

async function successfulSend(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    calls += 1;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.poctgoyercini.com');
    assert.equal(url.pathname, '/gateway/api/sms/v1/message/send');
    assert.equal(url.searchParams.get('publicKey'), config.publicKey);
    assert.equal(init?.method, 'POST');

    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${config.privateKey}`);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      Text: otpText,
      Purpose: 'INF',
      Options: { Originator: 'SET' },
      Receivers: [{ Receiver: '994501234567' }],
    });

    return jsonResponse({
      Status: 200,
      Description: 'Accepted',
      ReceiversRejected: [],
    });
  };

  await new PG365SmsProvider(config, fetchMock).sendOtp('+994501234567', '413927');
  assert.equal(calls, 1);
  assert.equal(normalizePG365Phone('994501234567'), '994501234567');
  assert.equal(normalizePG365Phone('0501234567'), '994501234567');
}

async function informationSmsUsesInf(): Promise<void> {
  resetProviderCircuitState();
  const fetchMock: typeof fetch = async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      Text: 'Növbəniz təsdiqləndi.',
      Purpose: 'INF',
      Options: { Originator: 'SET' },
      Receivers: [{ Receiver: '994501234567' }],
    });
    return jsonResponse({
      Status: 200,
      Description: 'Accepted',
      ReceiversRejected: [],
    });
  };

  await new PG365SmsProvider(config, fetchMock).sendInfo(
    '0501234567',
    'Növbəniz təsdiqləndi.'
  );
}

async function providerStatusFailure(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchMock: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({
      Status: 500,
      Description: 'Rejected 413927 for 994501234567 private-test-key',
      ReceiversRejected: [],
    });
  };
  const provider = new PG365SmsProvider(config, fetchMock);
  await assert.rejects(
    provider.sendOtp('0501234567', '413927'),
    isSafeProviderException
  );
  assert.equal(calls, 1);

  const httpFailureMock: typeof fetch = async () => jsonResponse({
    Status: 500,
    Description: 'HTTP rejection 413927 for 994501234567 private-test-key',
    ReceiversRejected: [],
  }, 503);
  await assert.rejects(
    new PG365SmsProvider(config, httpFailureMock).sendOtp('0501234567', '413927'),
    isSafeProviderException
  );
}

async function providerErrorInsideHttp200Body(): Promise<void> {
  resetProviderCircuitState();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    const fetchMock: typeof fetch = async () => jsonResponse({
      Status: 200,
      Description: '(ERRSMS0032) Not authorized for this message purpose',
      ReceiversRejected: [],
    });
    await assert.rejects(
      new PG365SmsProvider(config, fetchMock).sendOtp('0501234567', '413927'),
      isSafeProviderException
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(
    warnings.some((line) => line.includes('ERRSMS0032')),
    'Provider error code must be included in the delivery-failure log'
  );
}

async function rejectedReceiver(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchMock: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({
      Status: 200,
      Description: 'Receiver rejected',
      ReceiversRejected: [{ Receiver: '994501234567', Description: 'Invalid' }],
    });
  };
  const provider = new PG365SmsProvider(config, fetchMock);
  await assert.rejects(
    provider.sendOtp('994501234567', '413927'),
    isSafeProviderException
  );
  assert.equal(calls, 1);
}

async function timeoutWithoutRetry(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchMock: typeof fetch = async (_input, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('Expected an abort signal.'));
        return;
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  };
  const provider = new PG365SmsProvider({ ...config, timeoutMs: 5 }, fetchMock);
  await assert.rejects(
    provider.sendOtp('994501234567', '413927'),
    isSafeProviderException
  );
  assert.equal(calls, 1, 'OTP HTTP requests must never be retried automatically');
}

async function invalidPhone(): Promise<void> {
  resetProviderCircuitState();
  let calls = 0;
  const fetchMock: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({ Status: 200, Description: 'Accepted', ReceiversRejected: [] });
  };
  const provider = new PG365SmsProvider(config, fetchMock);
  await assert.rejects(
    provider.sendOtp('12345', '413927'),
    isSafeProviderException
  );
  assert.equal(calls, 0, 'Invalid phone numbers must be rejected before HTTP');
}

function missingEnvironmentVariables(): void {
  const validEnv: NodeJS.ProcessEnv = {
    PG365_API_URL: config.apiUrl,
    PG365_PUBLIC_KEY: config.publicKey,
    PG365_PRIVATE_KEY: config.privateKey,
    PG365_ORIGINATOR: config.originator,
    PG365_TIMEOUT_MS: String(config.timeoutMs),
  };
  const requiredKeys = [
    'PG365_API_URL',
    'PG365_PUBLIC_KEY',
    'PG365_PRIVATE_KEY',
    'PG365_ORIGINATOR',
    'PG365_TIMEOUT_MS',
  ] as const;

  for (const key of requiredKeys) {
    const incomplete = { ...validEnv };
    delete incomplete[key];
    assert.throws(
      () => loadPG365Config(incomplete),
      new RegExp(`${key} is required`)
    );
  }
}

function placeholderCredentialsAreRejected(): void {
  const validEnv: NodeJS.ProcessEnv = {
    PG365_API_URL: config.apiUrl,
    PG365_PUBLIC_KEY: config.publicKey,
    PG365_PRIVATE_KEY: config.privateKey,
    PG365_ORIGINATOR: config.originator,
    PG365_TIMEOUT_MS: String(config.timeoutMs),
  };

  for (const key of ['PG365_PUBLIC_KEY', 'PG365_PRIVATE_KEY'] as const) {
    assert.throws(
      () => loadPG365Config({ ...validEnv, [key]: '<secret-reference>' }),
      new RegExp(`${key} must be an injected runtime credential`)
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isSafeProviderException(error: unknown): boolean {
  assert.ok(error instanceof SmsProviderException);
  assert.equal(error.message, 'SMS provider request failed.');
  assert.equal(error.retryable, false, 'PG365 OTP failures must not be retried by the outbox');
  assert.ok(!error.message.includes(config.privateKey));
  assert.ok(!error.message.includes('413927'));
  assert.ok(!error.message.includes('994501234567'));
  return true;
}

async function main(): Promise<void> {
  await successfulSend();
  await informationSmsUsesInf();
  await providerStatusFailure();
  await providerErrorInsideHttp200Body();
  await rejectedReceiver();
  await timeoutWithoutRetry();
  await invalidPhone();
  missingEnvironmentVariables();
  placeholderCredentialsAreRejected();
  console.log('PG365 SMS regression tests passed (9/9).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
