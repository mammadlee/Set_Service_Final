import { OtpPurpose } from '../types/prisma';
import { credentialReferenceIssue } from './check-env';
import { logger } from './logger';
import {
  ProviderDeliveryError,
  requestProvider,
} from './provider-http';

const PG365_SEND_PATH = '/gateway/api/sms/v1/message/send';
const PG365_PURPOSE = 'INF' as const;

export interface SmsMessage {
  to: string;
  body: string;
  purpose?: OtpPurpose;
}

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
  sendInfo(phone: string, text: string): Promise<void>;
}

export interface PG365Config {
  apiUrl: string;
  publicKey: string;
  privateKey: string;
  originator: string;
  timeoutMs: number;
}

interface PG365RequestBody {
  Text: string;
  Purpose: typeof PG365_PURPOSE;
  Options: {
    Originator: string;
  };
  Receivers: Array<{
    Receiver: string;
  }>;
}

interface PG365ResponseBody {
  status: number | undefined;
  description: string | undefined;
  receiversRejected: readonly unknown[];
  providerError: string | undefined;
  providerErrorCode: string | undefined;
}

type SmsProviderFactory = (idempotencyKey: string) => SmsProvider;

export class SmsProviderException extends ProviderDeliveryError {
  constructor(message = 'SMS provider request failed.') {
    // OTP delivery must not be retried automatically by either the HTTP client
    // or the durable outbox.
    super(message, false);
    this.name = 'SmsProviderException';
  }
}

class ConsoleSmsProvider implements SmsProvider {
  constructor(private readonly idempotencyKey: string) {}

  async sendOtp(_phone: string, _code: string): Promise<void> {
    this.logSuppressed('otp');
  }

  async sendInfo(_phone: string, _text: string): Promise<void> {
    this.logSuppressed('info');
  }

  private logSuppressed(messageType: 'otp' | 'info'): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Console SMS provider cannot be used in production.');
    }

    logger.info('Development SMS delivery suppressed', {
      channel: 'sms',
      message_type: messageType,
      idempotency_key: this.idempotencyKey,
      recipient: '[hidden]',
      body: '[hidden]',
    });
  }
}

class GenericHttpSmsProvider implements SmsProvider {
  constructor(private readonly idempotencyKey: string) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.send(phone, otpMessage(code), 'OTP');
  }

  async sendInfo(phone: string, text: string): Promise<void> {
    await this.send(phone, text, 'INFO');
  }

  private async send(phone: string, text: string, purpose: 'OTP' | 'INFO'): Promise<void> {
    const endpoint = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;
    const from = process.env.SMS_FROM;
    if (!endpoint || !apiKey || !from) {
      throw new Error(
        'SMS_API_URL, SMS_API_KEY, and SMS_FROM are required for generic_http SMS provider.'
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
        body: JSON.stringify({ from, to: phone, body: text, purpose }),
      },
      {
        circuitKey: `sms:${new URL(endpoint).origin}`,
        idempotencyKey: this.idempotencyKey,
      }
    );
  }
}

export class PG365SmsProvider implements SmsProvider {
  constructor(
    private readonly config: PG365Config = loadPG365Config(process.env),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly idempotencyKey = 'pg365-sms-delivery'
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.send(phone, otpMessage(code));
  }

  async sendInfo(phone: string, text: string): Promise<void> {
    await this.send(phone, text);
  }

  private async send(phone: string, text: string): Promise<void> {
    const receiver = normalizePG365Phone(phone);
    const endpoint = new URL(PG365_SEND_PATH, this.config.apiUrl);
    endpoint.searchParams.set('publicKey', this.config.publicKey);

    const requestBody: PG365RequestBody = {
      Text: text,
      Purpose: PG365_PURPOSE,
      Options: { Originator: this.config.originator },
      Receivers: [{ Receiver: receiver }],
    };

    let response: Response;
    try {
      response = await requestProvider(
        endpoint.toString(),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.privateKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        {
          circuitKey: `sms:pg365:${endpoint.origin}`,
          idempotencyKey: this.idempotencyKey,
          timeoutMs: this.config.timeoutMs,
          maxAttempts: 1,
          fetchImpl: this.fetchImpl,
          returnErrorResponse: true,
        }
      );
    } catch (error) {
      logger.warn('PG365 SMS request failed', {
        provider_description: httpFailureDescription(error),
        recipient_masked: maskPG365Phone(receiver),
      });
      throw new SmsProviderException();
    }

    let providerResponse: PG365ResponseBody;
    try {
      providerResponse = parsePG365Response(await response.json());
    } catch {
      logger.warn('PG365 SMS response was invalid', {
        provider_description: response.ok
          ? 'Invalid JSON response'
          : `HTTP ${response.status}; invalid JSON response`,
        recipient_masked: maskPG365Phone(receiver),
      });
      throw new SmsProviderException();
    }

    const logMeta = {
      provider_description: sanitizeProviderDescription(
        providerResponse.providerError ?? providerResponse.description,
        receiver,
        this.config.privateKey
      ),
      provider_error_code: providerResponse.providerErrorCode,
      provider_status: providerResponse.status,
      provider_http_status: response.status,
      recipient_masked: maskPG365Phone(receiver),
    };

    if (
      !response.ok
      || providerResponse.status !== 200
      || providerResponse.receiversRejected.length > 0
      || providerResponse.providerError !== undefined
    ) {
      logger.warn('PG365 SMS delivery rejected', {
        ...logMeta,
        receivers_rejected: providerResponse.receiversRejected.length,
      });
      throw new SmsProviderException();
    }

    logger.info('PG365 SMS delivery accepted', logMeta);
  }
}

const smsProviderFactories: Readonly<Record<string, SmsProviderFactory>> = {
  console: (idempotencyKey) => new ConsoleSmsProvider(idempotencyKey),
  generic_http: (idempotencyKey) => new GenericHttpSmsProvider(idempotencyKey),
  pg365: (idempotencyKey) => new PG365SmsProvider(
    loadPG365Config(process.env),
    fetch,
    idempotencyKey
  ),
};

export function createSmsProvider(idempotencyKey = 'sms-delivery'): SmsProvider {
  const defaultProvider = process.env.NODE_ENV === 'production' ? 'pg365' : 'console';
  const providerName = process.env.SMS_PROVIDER ?? defaultProvider;
  const factory = smsProviderFactories[providerName];
  if (!factory) throw new Error(`Unsupported SMS_PROVIDER: ${providerName}`);
  return factory(idempotencyKey);
}

export async function deliverSmsMessage(
  message: SmsMessage,
  idempotencyKey: string
): Promise<void> {
  const provider = createSmsProvider(idempotencyKey);
  if (message.purpose) {
    const code = extractOtpCode(message.body);
    if (!code) throw new SmsProviderException('OTP delivery payload is invalid.');
    await provider.sendOtp(message.to, code);
    return;
  }
  await provider.sendInfo(message.to, message.body);
}

export function loadPG365Config(env: NodeJS.ProcessEnv): PG365Config {
  const apiUrl = requiredEnv(env, 'PG365_API_URL');
  const publicKey = requiredCredentialEnv(env, 'PG365_PUBLIC_KEY');
  const privateKey = requiredCredentialEnv(env, 'PG365_PRIVATE_KEY');
  const originator = requiredEnv(env, 'PG365_ORIGINATOR');
  const timeoutRaw = requiredEnv(env, 'PG365_TIMEOUT_MS');
  const timeoutMs = Number(timeoutRaw);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error('PG365_API_URL must be a valid HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('PG365_API_URL must be a valid HTTP(S) URL.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error('PG365_TIMEOUT_MS must be an integer between 1 and 120000.');
  }

  return {
    apiUrl: parsedUrl.toString(),
    publicKey,
    privateKey,
    originator,
    timeoutMs,
  };
}

export function normalizePG365Phone(phone: string): string {
  const compact = phone.trim().replace(/[\s().-]/g, '');
  const withoutPlus = compact.startsWith('+') ? compact.slice(1) : compact;
  const normalized = /^0\d{9}$/.test(withoutPlus)
    ? `994${withoutPlus.slice(1)}`
    : withoutPlus;

  if (!/^994\d{9}$/.test(normalized)) {
    throw new SmsProviderException();
  }
  return normalized;
}

export function maskPG365Phone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '[masked-phone]';
  return `${digits.slice(0, 5)}${'*'.repeat(digits.length - 7)}${digits.slice(-2)}`;
}

function otpMessage(code: string): string {
  return `SET doğrulama kodunuz: ${code}\n\nKod 5 dəqiqə etibarlıdır.\nHeç kimlə paylaşmayın.`;
}

function extractOtpCode(text: string): string | null {
  return text.match(/\b\d{6}\b/)?.[0] ?? null;
}

function parsePG365Response(value: unknown): PG365ResponseBody {
  if (typeof value === 'string') {
    const description = value.trim() || undefined;
    const providerErrorCode = extractPG365ErrorCode(description);
    return {
      status: undefined,
      description,
      receiversRejected: [],
      providerError: description,
      providerErrorCode,
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SmsProviderException();
  }
  const response = value as Record<string, unknown>;
  const description = typeof response.Description === 'string'
    ? response.Description
    : undefined;
  const explicitProviderError = firstPG365ErrorValue([
    response.Error,
    response.Errors,
    response.ErrorCode,
    response.ErrorMessage,
    response.ErrorDescription,
  ]);
  const encodedProviderError = findPG365ErrorText(value);
  const unsuccessfulResponse = response.Success === false || response.IsSuccess === false;
  const providerError = explicitProviderError
    ?? encodedProviderError
    ?? (unsuccessfulResponse ? description ?? 'Provider reported an unsuccessful response.' : undefined);
  return {
    status: typeof response.Status === 'number' ? response.Status : undefined,
    description,
    receiversRejected: Array.isArray(response.ReceiversRejected)
      ? response.ReceiversRejected
      : [],
    providerError,
    providerErrorCode: extractPG365ErrorCode(providerError),
  };
}

function firstPG365ErrorValue(values: unknown[]): string | undefined {
  for (const value of values) {
    const error = stringifyPG365ErrorValue(value);
    if (error) return error;
  }
  return undefined;
}

function stringifyPG365ErrorValue(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || value === null || value === undefined || value === false || value === 0) {
    return undefined;
  }
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return firstPG365ErrorValue(value);
  }
  if (typeof value !== 'object') return undefined;

  const error = value as Record<string, unknown>;
  const preferredFields = [
    error.Code,
    error.ErrorCode,
    error.Description,
    error.ErrorDescription,
    error.Message,
    error.ErrorMessage,
  ];
  for (const field of preferredFields) {
    const text = stringifyPG365ErrorValue(field, depth + 1);
    if (text) return text;
  }
  for (const field of Object.values(error)) {
    const text = stringifyPG365ErrorValue(field, depth + 1);
    if (text) return text;
  }
  return undefined;
}

function findPG365ErrorText(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    return extractPG365ErrorCode(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const error = findPG365ErrorText(item, depth + 1);
      if (error) return error;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  for (const field of Object.values(value as Record<string, unknown>)) {
    const error = findPG365ErrorText(field, depth + 1);
    if (error) return error;
  }
  return undefined;
}

function extractPG365ErrorCode(value: string | undefined): string | undefined {
  return value?.match(/\bERRSMS\d+\b/i)?.[0].toUpperCase();
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for PG365 SMS provider.`);
  return value;
}

function requiredCredentialEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = requiredEnv(env, key);
  const issue = credentialReferenceIssue(value);
  if (issue) throw new Error(`${key} ${issue}.`);
  return value;
}

function httpFailureDescription(error: unknown): string {
  if (error instanceof ProviderDeliveryError && error.statusCode) {
    return `HTTP ${error.statusCode}`;
  }
  if (error instanceof ProviderDeliveryError && error.message.includes('timed out')) {
    return 'HTTP request timed out';
  }
  return 'HTTP request failed';
}

function sanitizeProviderDescription(
  description: string | undefined,
  receiver: string,
  privateKey: string
): string {
  if (!description) return '[not provided]';
  const maskedReceiver = maskPG365Phone(receiver);
  return description
    .split(privateKey).join('[redacted-secret]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted-secret]')
    .replace(/\b\d{4,8}\b/g, '[redacted-code]')
    .split(receiver).join(maskedReceiver)
    .slice(0, 512);
}
