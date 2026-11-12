const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const migrationIds = [
  '20260715120000_order_idempotency_outbox',
  '20260716100000_order_state_machine_phase7',
  '20260716123000_refresh_token_families',
];

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.resolve(relativePath), 'utf8');
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

async function main(): Promise<void> {
  const [releaseRunbook, performanceReview, incident, explainPack] = await Promise.all([
    read('docs/DATABASE_RELEASE_RUNBOOK.md'),
    read('docs/DATABASE_PERFORMANCE_REVIEW.md'),
    read('docs/MIGRATION_INCIDENT_2026-07-16.md'),
    read('scripts/performance-explain.sql'),
  ]);

  for (const migrationId of migrationIds) {
    assert.match(releaseRunbook, new RegExp(migrationId));
    assert.match(incident, new RegExp(migrationId));
  }

  assert.match(releaseRunbook, /backup\/PITR/i);
  assert.match(releaseRunbook, /roll back the application|application rollback/i);
  assert.match(releaseRunbook, /no automatic destructive database rollback/i);
  assert.match(releaseRunbook, /prisma migrate reset/i);
  assert.match(performanceReview, /isolated/i);
  assert.match(performanceReview, /staging clone/i);
  assert.match(performanceReview, /read-only/i);

  assert.doesNotMatch(incident, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(incident, /\.neon\.tech/i);
  assert.doesNotMatch(incident, /\b(?:DATABASE_URL|DIRECT_URL)\s*=/i);
  assert.match(incident, /No destructive rollback was attempted/i);
  assert.match(incident, /backup\/PITR/i);

  const executableSql = stripSqlComments(explainPack);
  assert.match(executableSql, /\bSET TRANSACTION READ ONLY\b/i);
  assert.match(executableSql, /\bEXPLAIN\s*\(\s*ANALYZE\s*,\s*BUFFERS\b/i);
  assert.match(executableSql, /\bROLLBACK\b/i);
  assert.doesNotMatch(
    executableSql,
    /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE)\b/i,
  );

  console.log('release-runbook-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
