import { OtpPurpose } from '../types/prisma';
import { logger } from './logger';

export interface SmsMessage {
  to: string;
  body: string;
  purpose?: OtpPurpose;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async send(message: SmsMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Console SMS provider cannot be used in production.');
    }

    logger.info('Development SMS message', {
      to: message.to,
      purpose: message.purpose,
      body: process.env.OTP_LOG_CODES === 'false' ? '[hidden]' : message.body,
    });
  }
}

class GenericHttpSmsProvider implements SmsProvider {
  async send(message: SmsMessage): Promise<void> {
    const endpoint = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;
    const from = process.env.SMS_FROM;
    if (!endpoint || !apiKey || !from) {
      throw new Error('SMS_API_URL, SMS_API_KEY, and SMS_FROM are required for generic_http SMS provider.');
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
        body: message.body,
        purpose: message.purpose,
      }),
    });

    if (!response.ok) {
      throw new Error(`SMS provider failed with HTTP ${response.status}.`);
    }
  }
}

function createSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? 'console';
  if (provider === 'generic_http') return new GenericHttpSmsProvider();
  if (provider === 'console') return new ConsoleSmsProvider();
  throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
}

export async function sendOtpSms(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
  const provider = createSmsProvider();
  await provider.send({
    to: phone,
    purpose,
    body: `SET Service OTP kodunuz: ${code}. Kod 5 dəqiqə ərzində etibarlıdır.`,
  });
}
