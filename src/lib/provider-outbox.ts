import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Prisma } from '@prisma/client';
import { OtpPurpose } from '../types/prisma';
import { deliverEmailMessage } from './email';
import { deliverSmsMessage } from './sms';

type DeliveryChannel = 'sms' | 'email';

interface ProviderDeliveryPayload {
  channel: DeliveryChannel;
  to: string;
  purpose: string;
  subject?: string;
  body: string;
}

export type EncryptedProviderPayload = Prisma.JsonObject & {
  version: number;
  algorithm: string;
  context?: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export interface ProviderOutboxEventData {
  id: string;
  aggregate: string;
  aggregate_id: string;
  event_type: string;
  payload: EncryptedProviderPayload;
}

export function buildOtpProviderOutboxEvent(input: {
  channel: DeliveryChannel;
  to: string;
  purpose: OtpPurpose | 'email_verification';
  code: string;
  dedupeKey: string;
}): ProviderOutboxEventData {
  const payload: ProviderDeliveryPayload = input.channel === 'sms'
    ? {
        channel: 'sms',
        to: input.to,
        purpose: input.purpose,
        body: `SET Service OTP kodunuz: ${input.code}. Kod 5 dəqiqə ərzində etibarlıdır.`,
      }
    : {
        channel: 'email',
        to: input.to,
        purpose: input.purpose,
        subject: 'SET Service təsdiq kodu',
        body: `SET Service təsdiq kodunuz: ${input.code}. Kod 5 dəqiqə ərzində etibarlıdır.`,
      };
  const id = createHash('sha256')
    .update([
      'provider-delivery-v1',
      input.channel,
      input.to.trim().toLowerCase(),
      input.purpose,
      input.dedupeKey,
    ].join('|'))
    .digest('hex');

  return {
    id,
    aggregate: 'provider_delivery',
    aggregate_id: id,
    event_type: `provider.${input.channel}.send`,
    payload: encryptProviderPayload(payload, id),
  };
}

export async function deliverProviderOutboxEvent(
  eventId: string,
  eventType: string,
  rawPayload: Prisma.JsonValue
): Promise<void> {
  const payload = decryptProviderPayload(rawPayload, eventId);
  if (eventType === 'provider.sms.send' && payload.channel === 'sms') {
    await deliverSmsMessage(
      {
        to: payload.to,
        purpose: payload.purpose as OtpPurpose,
        body: payload.body,
      },
      eventId
    );
    return;
  }
  if (eventType === 'provider.email.send' && payload.channel === 'email') {
    await deliverEmailMessage(
      {
        to: payload.to,
        purpose: payload.purpose,
        subject: payload.subject ?? 'SET Service',
        body: payload.body,
      },
      eventId
    );
    return;
  }
  throw new Error('Provider outbox event type does not match its encrypted payload.');
}

export function encryptProviderPayload(
  payload: ProviderDeliveryPayload,
  eventId: string
): EncryptedProviderPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(eventId, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return {
    version: 2,
    algorithm: 'A256GCM',
    context: eventId,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

export function decryptProviderPayload(
  rawPayload: Prisma.JsonValue,
  eventId: string
): ProviderDeliveryPayload {
  const encrypted = parseEncryptedPayload(rawPayload);
  if (encrypted.version === 2 && encrypted.context !== eventId) {
    throw new Error('Provider outbox payload context does not match its event.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(encrypted.iv, 'base64url')
  );
  if (encrypted.version === 2) {
    decipher.setAAD(Buffer.from(eventId, 'utf8'));
  }
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext) as unknown;
  if (!isDeliveryPayload(parsed)) {
    throw new Error('Decrypted provider outbox payload is invalid.');
  }
  return parsed;
}

function parseEncryptedPayload(rawPayload: Prisma.JsonValue): EncryptedProviderPayload {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new Error('Provider outbox payload must be an encrypted object.');
  }
  const payload = rawPayload as Record<string, unknown>;
  if (
    (payload.version !== 1 && payload.version !== 2)
    || payload.algorithm !== 'A256GCM'
    || (payload.version === 2 && typeof payload.context !== 'string')
    || typeof payload.iv !== 'string'
    || typeof payload.tag !== 'string'
    || typeof payload.ciphertext !== 'string'
  ) {
    throw new Error('Provider outbox encryption envelope is invalid.');
  }
  return payload as EncryptedProviderPayload;
}

function isDeliveryPayload(value: unknown): value is ProviderDeliveryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    (payload.channel === 'sms' || payload.channel === 'email')
    && typeof payload.to === 'string'
    && typeof payload.purpose === 'string'
    && typeof payload.body === 'string'
    && (payload.subject === undefined || typeof payload.subject === 'string')
  );
}

function encryptionKey(): Buffer {
  const configured = process.env.PROVIDER_OUTBOX_ENCRYPTION_SECRET?.trim();
  const fallback = process.env.NODE_ENV === 'production'
    ? undefined
    : process.env.OTP_PEPPER?.trim();
  const secret = configured || fallback;
  if (!secret || secret.length < 32) {
    throw new Error(
      'PROVIDER_OUTBOX_ENCRYPTION_SECRET must contain at least 32 characters.'
    );
  }
  return createHash('sha256').update(secret).digest();
}
