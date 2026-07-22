import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  RetentionClient,
  cleanupRetentionBatch,
  loadRetentionPolicy,
} from '../src/lib/retention';

type Query = { where: unknown; take: number };

function delegate(prefix: string, queries: Query[]) {
  return {
    async findMany(args: Query) {
      queries.push(args);
      return [{ id: `${prefix}-1` }, { id: `${prefix}-2` }];
    },
    async deleteMany(args: { where: { id: { in: string[] } } }) {
      return { count: args.where.id.in.length };
    },
  };
}

async function main(): Promise<void> {
  assert.deepEqual(loadRetentionPolicy({}), {
    outboxProcessedDays: 30,
    outboxDeadDays: 90,
    otpDays: 30,
    refreshTokenDays: 90,
    auditLogDays: 365,
  });
  assert.throws(() => loadRetentionPolicy({ AUDIT_LOG_RETENTION_DAYS: '0' }), /between 1 and 3650/);

  const queries: Query[] = [];
  const client = {
    outboxEvent: delegate('outbox', queries),
    otpCode: delegate('otp', queries),
    refreshToken: delegate('refresh', queries),
    auditLog: delegate('audit', queries),
  } as unknown as RetentionClient;
  const result = await cleanupRetentionBatch(new Date('2026-07-22T00:00:00.000Z'), 10, client);
  assert.deepEqual(result, {
    outboxProcessed: 2,
    outboxDead: 2,
    otpCodes: 2,
    refreshTokens: 2,
    auditLogs: 2,
    hasMore: false,
  });
  assert.equal(queries.length, 5);
  assert.ok(queries.every((query) => query.take === 10));

  const outbox = fs.readFileSync(path.resolve('src/lib/outbox.ts'), 'utf8');
  const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'), 'utf8');
  assert.match(outbox, /cleanupRetentionBatch\(now\)/);
  assert.match(schema, /model AuditLog[\s\S]*?@@index\(\[created_at\]\)/);
  console.log('retention-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
