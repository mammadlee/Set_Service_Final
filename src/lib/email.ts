import { logger } from './logger';
import { requestProvider } from './provider-http';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  purpose?: string;
}

export interface EmailProvider {
  send(message: EmailMessage, idempotencyKey: string): Promise<void>;
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

function createEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';
  if (provider === 'generic_http') return new GenericHttpEmailProvider();
  if (provider === 'console') return new ConsoleEmailProvider();
  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

export async function deliverEmailMessage(
  message: EmailMessage,
  idempotencyKey: string
): Promise<void> {
  await createEmailProvider().send(message, idempotencyKey);
}
