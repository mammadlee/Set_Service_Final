import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function main(): void {
  const source = fs.readFileSync(path.resolve('src/modules/reports/reports.service.ts'), 'utf8');
  assert.match(
    source,
    /options\.includePendingWorkerApprovals === false\s*\? Promise\.resolve\(0\)\s*:\s*prisma\.worker\.count/,
    'company-visible summaries must not query the platform-wide pending worker count',
  );
  assert.match(
    source,
    /\{ includePendingWorkerApprovals: false \}/,
    'company report entry point must explicitly disable platform approval metrics',
  );
  console.log('company-report-isolation-regression: OK');
}

main();
