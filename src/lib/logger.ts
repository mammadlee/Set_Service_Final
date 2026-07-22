type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

import { getRequestContext } from './request-context';

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  const context = getRequestContext();
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'setservice-api',
    ...(context ?? {}),
    ...(meta ? { meta: redactSensitive(meta) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
  },
  info(message: string, meta?: LogMeta) {
    write('info', message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write('warn', message, meta);
  },
  error(message: string, meta?: LogMeta) {
    write('error', message, meta);
  },
};

const sensitiveKeys = new Set([
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'otp',
  'otpcode',
  'code',
  'qrtoken',
  'apikey',
  'secret',
  'password',
  'cookie',
  'setcookie',
  'privatekey',
]);

function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binary]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveKey(key)
        ? '[redacted]'
        : maskContactField(key, redactSensitive(entry, seen)),
    ])
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return sensitiveKeys.has(normalized) || normalized.endsWith('token') || normalized.includes('secret');
}

function maskContactField(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  if (normalized.includes('email') || (normalized === 'to' && value.includes('@'))) {
    return maskEmail(value);
  }
  if (
    normalized.includes('phone')
    || normalized.includes('mobile')
    || normalized.includes('telephone')
    || (normalized === 'to' && /^\+?\d[\d\s().-]+$/.test(value))
  ) {
    return maskPhone(value);
  }
  return value;
}

function sanitizeString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]')
    .replace(
      /\b(otp|password|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/gi,
      '$1=[redacted]'
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
    .replace(/\+[1-9]\d{7,14}\b/g, (phone) => maskPhone(phone));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '[masked-email]';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[masked-phone]';
  return `+${'*'.repeat(Math.max(1, digits.length - 4))}${digits.slice(-4)}`;
}
