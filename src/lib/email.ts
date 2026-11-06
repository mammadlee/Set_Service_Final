import { Resend } from 'resend';
import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from 'resend';
import { logger } from './logger';
import { ProviderDeliveryError, requestProvider } from './provider-http';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  purpose?: string;
}

export interface EmailProvider {
  send(message: EmailMessage, idempotencyKey: string): Promise<void>;
}

export interface ResendEmailClient {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions
    ): Promise<CreateEmailResponse>;
  };
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage, idempotencyKey: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Console email provider cannot be used in production.');
    }

    logger.info('Development email delivery suppressed', {
      channel: 'email',
      purpose: message.purpose,
      idempotency_key: idempotencyKey,
      recipient: '[hidden]',
      subject: '[hidden]',
      body: '[hidden]',
    });
  }
}

class GenericHttpEmailProvider implements EmailProvider {
  async send(message: EmailMessage, idempotencyKey: string): Promise<void> {
    const endpoint = process.env.EMAIL_API_URL;
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!endpoint || !apiKey || !from) {
      throw new Error(
        'EMAIL_API_URL, EMAIL_API_KEY, and EMAIL_FROM are required for generic_http email provider.'
      );
    }

    await requestProvider(
      endpoint,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          body: message.body,
          purpose: message.purpose,
        }),
      },
      {
        circuitKey: `email:${new URL(endpoint).origin}`,
        idempotencyKey,
      }
    );
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly from: string,
    private readonly client: ResendEmailClient
  ) {}

  async send(message: EmailMessage, idempotencyKey: string): Promise<void> {
    let result: CreateEmailResponse;
    try {
      result = await this.client.emails.send(
        {
          from: this.from,
          to: message.to,
          subject: message.subject,
          text: message.body,
        },
        { idempotencyKey }
      );
    } catch {
      // The SDK may surface transport failures as exceptions. Replace the
      // original error so request data and credentials can never reach outbox
      // error storage or logs.
      throw new ProviderDeliveryError('Resend email request failed.', true);
    }

    if (result.error) {
      const statusCode = result.error.statusCode ?? undefined;
      throw new ProviderDeliveryError(
        resendFailureMessage(result.error.name, statusCode),
        isRetryableResendStatus(statusCode),
        statusCode
      );
    }
  }
}

export function createEmailProvider(
  environment: NodeJS.ProcessEnv = process.env,
  resendClient?: ResendEmailClient
): EmailProvider {
  const provider = environment.EMAIL_PROVIDER ?? 'console';
  if (provider === 'generic_http') return new GenericHttpEmailProvider();
  if (provider === 'resend') {
    const apiKey = requiredEnvironmentValue(environment, 'RESEND_API_KEY', 'resend');
    const from = requiredEnvironmentValue(environment, 'EMAIL_FROM', 'resend');
    return new ResendEmailProvider(from, resendClient ?? new Resend(apiKey));
  }
  if (provider === 'console') return new ConsoleEmailProvider();
  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

export async function deliverEmailMessage(
  message: EmailMessage,
  idempotencyKey: string
): Promise<void> {
  await createEmailProvider().send(message, idempotencyKey);
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: 'RESEND_API_KEY' | 'EMAIL_FROM',
  provider: string
): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required for ${provider} email provider.`);
  return value;
}

function isRetryableResendStatus(statusCode: number | undefined): boolean {
  return statusCode === undefined
    || statusCode === 408
    || statusCode === 409
    || statusCode === 425
    || statusCode === 429
    || statusCode >= 500;
}

function resendFailureMessage(name: string, statusCode: number | undefined): string {
  const safeName = /^[a-z_]+$/.test(name) ? name : 'provider_error';
  const status = statusCode === undefined ? '' : `; HTTP ${statusCode}`;
  return `Resend email delivery failed (${safeName}${status}).`;
}
