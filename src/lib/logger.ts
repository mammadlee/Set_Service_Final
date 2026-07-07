type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
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
]);

function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binary]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : redactSensitive(entry, seen),
    ])
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return sensitiveKeys.has(normalized) || normalized.endsWith('token') || normalized.includes('secret');
}
