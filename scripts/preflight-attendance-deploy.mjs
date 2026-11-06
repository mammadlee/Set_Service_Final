import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const duplicateMessagePattern = /attendance preflight failed: (\d+) assignment\(s\) have duplicate non-deleted attendance rows/;
const preflightSql = fs.readFileSync(
  new URL('./preflight-attendance-deploy.sql', import.meta.url),
  'utf8',
);

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error('attendance preflight failed: DIRECT_URL is required');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
  errorFormat: 'minimal',
  log: [],
});

try {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15min'");
    await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '60s'");

    const relationRows = await tx.$queryRawUnsafe(
      "SELECT to_regclass('public.attendance_logs') IS NOT NULL AS exists",
    );
    await tx.$executeRawUnsafe(preflightSql);
    return relationRows[0]?.exists === true ? 'passed' : 'fresh';
  }, {
    maxWait: 5_000,
    timeout: 900_000,
  });

  if (outcome === 'fresh') {
    console.log('attendance_logs is not present; treating this as a fresh database');
  } else {
    console.log('attendance preflight passed');
  }
} catch (error) {
  const duplicateMatch = error instanceof Error
    ? error.message.match(duplicateMessagePattern)
    : null;
  if (duplicateMatch) {
    console.error(
      `attendance preflight failed: ${duplicateMatch[1]} assignment(s) have duplicate non-deleted attendance rows; run scripts/preflight-attendance-one-session.sql and resolve them manually`,
    );
  } else {
    console.error('attendance preflight query failed; database error details redacted');
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
