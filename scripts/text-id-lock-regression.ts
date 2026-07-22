import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const lockSources = [
  'src/modules/workers/workers.service.ts',
  'src/modules/companies/companies.service.ts',
  'scripts/private-document-backfill.ts',
];

function assertSourceInvariants(): void {
  const sources = lockSources.map((file) => ({
    file,
    source: fs.readFileSync(path.resolve(file), 'utf8'),
  }));

  for (const { file, source } of sources) {
    assert.equal(source.includes('::uuid FOR UPDATE'), false, `${file} must not cast TEXT IDs to uuid`);
  }

  const workerSource = sources[0].source;
  const companySource = sources[1].source;
  assert.ok(
    (workerSource.match(/SELECT id FROM workers WHERE id = \$\{worker\.id\} FOR UPDATE/g) ?? []).length >= 3,
    'worker document upload/delete and account deletion must retain row locks',
  );
  assert.ok(
    companySource.includes('SELECT id FROM companies WHERE id = ${company.id} FOR UPDATE'),
    'company document replacement must retain its row lock',
  );
}

function assertLocalTestDatabaseUrl(rawValue: string | undefined): void {
  if (!rawValue) throw new Error('DATABASE_URL is required for the text ID lock integration regression.');
  const parsed = new URL(rawValue);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('TEXT_ID_LOCK_TEST_CONFIRM may only target a local PostgreSQL instance.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName.toLowerCase().includes('test')) {
    throw new Error('The integration database name must contain "test".');
  }
}

async function assertDatabaseLocks(): Promise<void> {
  assertLocalTestDatabaseUrl(process.env.DATABASE_URL);
  const { prisma } = await import('../src/lib/prisma');
  try {
    const columnTypes = await prisma.$queryRaw<Array<{ table_name: string; data_type: string }>>`
      SELECT table_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'id'
        AND table_name IN ('workers', 'companies')
      ORDER BY table_name
    `;
    assert.deepEqual(columnTypes, [
      { table_name: 'companies', data_type: 'text' },
      { table_name: 'workers', data_type: 'text' },
    ]);

    await prisma.$transaction(async (tx) => {
      const id = randomUUID();
      await tx.$queryRaw`SELECT id FROM workers WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${id} FOR UPDATE`;
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  assertSourceInvariants();
  if (process.env.TEXT_ID_LOCK_TEST_CONFIRM === '1') {
    await assertDatabaseLocks();
  }
  console.log('text-id-lock-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
