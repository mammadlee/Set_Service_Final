import { randomBytes } from 'node:crypto';

type SeedEnvironment = NodeJS.ProcessEnv;

const SECRET_PLACEHOLDER = /^<[^>]+>$/;

export function assertSeedAllowed(env: SeedEnvironment = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('PRODUCTION_SEED_DISABLED');
  }
}

export function resolveSeedPassword(
  envName: string,
  env: SeedEnvironment = process.env
): string {
  const provided = env[envName]?.trim();
  if (provided) {
    assertAcceptableSeedPassword(envName, provided);
    return provided;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(`PRODUCTION_SEED_PASSWORD_REQUIRED:${envName}`);
  }

  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

export function assertAcceptableSeedPassword(envName: string, value: string): void {
  if (
    value.length < 16
    || SECRET_PLACEHOLDER.test(value)
    || !/[a-z]/.test(value)
    || !/[A-Z]/.test(value)
    || !/\d/.test(value)
    || !/[^A-Za-z0-9]/.test(value)
  ) {
    throw new Error(`UNSAFE_SEED_PASSWORD:${envName}`);
  }
}

export function safeSeedErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}
