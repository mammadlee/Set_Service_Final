export type JwtTtlKey =
  | 'JWT_ACCESS_EXPIRES_IN'
  | 'JWT_REFRESH_EXPIRES_IN'
  | 'JWT_REGISTRATION_EXPIRES_IN';

type JwtTtlSpec = {
  defaultValue: string;
  minimumSeconds: number;
  maximumSeconds: number;
};

export const JWT_TTL_SPECS: Readonly<Record<JwtTtlKey, JwtTtlSpec>> = {
  JWT_ACCESS_EXPIRES_IN: { defaultValue: '15m', minimumSeconds: 60, maximumSeconds: 60 * 60 },
  JWT_REFRESH_EXPIRES_IN: { defaultValue: '30d', minimumSeconds: 60 * 60, maximumSeconds: 90 * 24 * 60 * 60 },
  JWT_REGISTRATION_EXPIRES_IN: { defaultValue: '30m', minimumSeconds: 60, maximumSeconds: 60 * 60 },
};

const UNIT_SECONDS = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 } as const;

export function parseJwtTtlSeconds(value: string): number | null {
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase() as keyof typeof UNIT_SECONDS;
  const seconds = amount * UNIT_SECONDS[unit];
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

export function jwtTtlIssue(key: JwtTtlKey, value: string | undefined): string | null {
  const spec = JWT_TTL_SPECS[key];
  const configured = value?.trim() || spec.defaultValue;
  const seconds = parseJwtTtlSeconds(configured);
  if (seconds === null) return `${key} must use a positive integer followed by s, m, h, or d`;
  if (seconds < spec.minimumSeconds || seconds > spec.maximumSeconds) {
    return `${key} must be between ${spec.minimumSeconds} and ${spec.maximumSeconds} seconds`;
  }
  return null;
}

export function readJwtTtl(key: JwtTtlKey, env: NodeJS.ProcessEnv = process.env): string {
  const spec = JWT_TTL_SPECS[key];
  const configured = env[key]?.trim() || spec.defaultValue;
  const issue = jwtTtlIssue(key, configured);
  if (issue) throw new Error(issue);
  return configured;
}
