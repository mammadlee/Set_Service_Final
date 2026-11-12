import { spawn } from 'node:child_process';

const migrationSessionOptions = [
  '-c lock_timeout=5s',
  '-c statement_timeout=15min',
  '-c idle_in_transaction_session_timeout=60s',
].join(' ');

function withMigrationTimeouts(rawValue, variableName) {
  if (!rawValue) {
    throw new Error(`${variableName} is required`);
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${variableName} must use the PostgreSQL protocol`);
  }

  const existingOptions = parsed.searchParams.get('options')?.trim();
  parsed.searchParams.set(
    'options',
    [existingOptions, migrationSessionOptions].filter(Boolean).join(' '),
  );
  return parsed.toString();
}

let databaseUrl;
let directUrl;
try {
  databaseUrl = withMigrationTimeouts(process.env.DATABASE_URL, 'DATABASE_URL');
  directUrl = withMigrationTimeouts(process.env.DIRECT_URL, 'DIRECT_URL');
} catch (error) {
  console.error(`migration startup failed: ${error.message}`);
  process.exit(1);
}

const child = spawn(
  '/nodejs/bin/node',
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: directUrl,
    },
    stdio: 'inherit',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.once('error', () => {
  console.error('migration startup failed: unable to launch the Prisma CLI');
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
