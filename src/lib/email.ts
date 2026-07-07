import { logger } from './logger';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  purpose?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Console email provider production mühitində istifadə edilə bilməz.');
    }

    logger.info('Development email message', {
      to: message.to,
      purpose: message.purpose,
      subject: message.subject,
      body: process.env.OTP_LOG_CODES === 'false' ? '[hidden]' : message.body,
    });
  }
}

class GenericHttpEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const endpoint = process.env.EMAIL_API_URL;
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!endpoint || !apiKey || !from) {
      throw new Error('generic_http email provider üçün EMAIL_API_URL, EMAIL_API_KEY və EMAIL_FROM tələb olunur.');
    }

    const response = await fetch(endpoint, {
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
    });

    if (!response.ok) {
      throw new Error(`Email provider HTTP ${response.status} cavabı qaytardı.`);
    }
  }
}

function createEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';
  if (provider === 'generic_http') return new GenericHttpEmailProvider();
  if (provider === 'console') return new ConsoleEmailProvider();
  throw new Error(`EMAIL_PROVIDER dəstəklənmir: ${provider}`);
}

export async function sendEmailCode(
  email: string,
  code: string,
  purpose: string
): Promise<void> {
  const provider = createEmailProvider();
  await provider.send({
    to: email,
    purpose,
    subject: 'SET Service təsdiq kodu',
    body: `SET Service təsdiq kodunuz: ${code}. Kod 5 dəqiqə ərzində etibarlıdır.`,
  });
}
