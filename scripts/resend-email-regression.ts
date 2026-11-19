import assert from 'node:assert/strict';
import {
  createEmailProvider,
  ResendEmailClient,
  ResendEmailProvider,
} from '../src/lib/email';
import {
  isPermanentProviderError,
  ProviderDeliveryError,
  resetProviderCircuitState,
} from '../src/lib/provider-http';
import { logger } from '../src/lib/logger';

const originalEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;

const emailMessage = {
  to: 'recipient@example.test',
  subject: 'SET Service verification',
  body: 'Sensitive one-time code: 613904',
  purpose: 'email_verification',
};

async function main(): Promise<void> {
  await selectsResendAndForwardsSupportedFields();
  rejectsMissingResendConfiguration();
  await preservesGenericHttpProvider();
  await propagatesSafeProviderErrorsForOutboxRetry();
  await doesNotLeakSensitiveDataToLogs();
  console.log('Resend email provider regression checks passed.');
}

async function selectsResendAndForwardsSupportedFields(): Promise<void> {
  let sentPayload: unknown;
  let sentOptions: unknown;
  const client: ResendEmailClient = {
    emails: {
      async send(payload, options) {
        sentPayload = payload;
        sentOptions = options;
        return {
          data: { id: 'resend-message-id' },
          error: null,
          headers: null,
        };
      },
    },
  };
  const provider = createEmailProvider(
    {
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'test-only-resend-credential-material',
      EMAIL_FROM: 'SET Service <no-reply@example.test>',
    },
    client
  );

  assert.equal(provider instanceof ResendEmailProvider, true);
  await provider.send(emailMessage, 'provider-outbox-event-id');

  assert.deepEqual(sentPayload, {
    from: 'SET Service <no-reply@example.test>',
    to: emailMessage.to,
    subject: emailMessage.subject,
    text: emailMessage.body,
  });
  assert.deepEqual(sentOptions, { idempotencyKey: 'provider-outbox-event-id' });
  assert.equal(Object.hasOwn(sentPayload as object, 'purpose'), false);
  assert.equal(Object.hasOwn(sentPayload as object, 'body'), false);
}

function rejectsMissingResendConfiguration(): void {
  const unusedClient = successfulClient();
  assert.throws(
    () => createEmailProvider(
      { EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'no-reply@example.test' },
      unusedClient
    ),
    /RESEND_API_KEY is required/
  );
  assert.throws(
    () => createEmailProvider(
      {
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-only-resend-credential-material',
      },
      unusedClient
    ),
    /EMAIL_FROM is required/
  );
}

async function preservesGenericHttpProvider(): Promise<void> {
  resetProviderCircuitState();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  process.env.EMAIL_PROVIDER = 'generic_http';
  process.env.EMAIL_API_URL = 'https://email-provider.example.test/send';
  process.env.EMAIL_API_KEY = 'test-only-generic-email-credential';
  process.env.EMAIL_FROM = 'SET Service <no-reply@example.test>';

  await createEmailProvider().send(emailMessage, 'generic-http-event-id');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, process.env.EMAIL_API_URL);
  const headers = new Headers(requests[0].init?.headers);
  assert.equal(headers.get('idempotency-key'), 'generic-http-event-id');
  assert.equal(headers.get('authorization'), `Bearer ${process.env.EMAIL_API_KEY}`);
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    from: process.env.EMAIL_FROM,
    to: emailMessage.to,
    subject: emailMessage.subject,
    body: emailMessage.body,
    purpose: emailMessage.purpose,
  });
}

async function propagatesSafeProviderErrorsForOutboxRetry(): Promise<void> {
  const sensitiveProviderMessage = [
    emailMessage.to,
    emailMessage.body,
    'test-only-resend-credential-material',
  ].join(' | ');
  const retryableProvider = new ResendEmailProvider(
    'SET Service <no-reply@example.test>',
    failingClient('rate_limit_exceeded', 429, sensitiveProviderMessage)
  );
  const retryableError = await rejectionFrom(
    retryableProvider.send(emailMessage, 'retryable-event-id')
  );
  assert.equal(retryableError instanceof ProviderDeliveryError, true);
  assert.equal(isPermanentProviderError(retryableError), false);
  assert.equal((retryableError as ProviderDeliveryError).statusCode, 429);
  assertNoSensitiveData(retryableError);

  const permanentProvider = new ResendEmailProvider(
    'SET Service <no-reply@example.test>',
    failingClient('validation_error', 422, sensitiveProviderMessage)
  );
  const permanentError = await rejectionFrom(
    permanentProvider.send(emailMessage, 'permanent-event-id')
  );
  assert.equal(permanentError instanceof ProviderDeliveryError, true);
  assert.equal(isPermanentProviderError(permanentError), true);
  assert.equal((permanentError as ProviderDeliveryError).statusCode, 422);
  assertNoSensitiveData(permanentError);

  const transportProvider = new ResendEmailProvider(
    'SET Service <no-reply@example.test>',
    {
      emails: {
        async send() {
          throw new Error(sensitiveProviderMessage);
        },
      },
    }
  );
  const transportError = await rejectionFrom(
    transportProvider.send(emailMessage, 'network-event-id')
  );
  assert.equal(transportError instanceof ProviderDeliveryError, true);
  assert.equal(isPermanentProviderError(transportError), false);
  assertNoSensitiveData(transportError);
}

async function doesNotLeakSensitiveDataToLogs(): Promise<void> {
  const captured: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capture = (...values: unknown[]) => captured.push(values.map(String).join(' '));
  console.log = capture;
  console.warn = capture;
  console.error = capture;

  try {
    const provider = new ResendEmailProvider(
      'SET Service <no-reply@example.test>',
      failingClient(
        'rate_limit_exceeded',
        429,
        `${emailMessage.to} ${emailMessage.body} test-only-resend-credential-material`
      )
    );
    await assert.rejects(provider.send(emailMessage, 'log-safety-event-id'));
    logger.warn('Resend email regression log-safety probe', {
      RESEND_API_KEY: 'test-only-resend-credential-material',
      body: emailMessage.body,
      to: emailMessage.to,
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  const output = captured.join('\n');
  assert.equal(captured.length, 1);
  assert.match(output, /\[redacted\]/);
  assert.equal(output.includes(emailMessage.to), false);
  assert.equal(output.includes(emailMessage.body), false);
  assert.equal(output.includes('test-only-resend-credential-material'), false);
}

function successfulClient(): ResendEmailClient {
  return {
    emails: {
      async send() {
        return {
          data: { id: 'resend-message-id' },
          error: null,
          headers: null,
        };
      },
    },
  };
}

function failingClient(
  name: 'rate_limit_exceeded' | 'validation_error',
  statusCode: number,
  message: string
): ResendEmailClient {
  return {
    emails: {
      async send() {
        return {
          data: null,
          error: { name, statusCode, message },
          headers: null,
        };
      },
    },
  };
}

async function rejectionFrom(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('Expected email provider delivery to reject.');
}

function assertNoSensitiveData(error: unknown): void {
  const output = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  assert.equal(output.includes(emailMessage.to), false);
  assert.equal(output.includes(emailMessage.body), false);
  assert.equal(output.includes('test-only-resend-credential-material'), false);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.env = originalEnvironment;
    globalThis.fetch = originalFetch;
  });
