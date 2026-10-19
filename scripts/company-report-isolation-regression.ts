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
    /includePendingWorkerApprovals:\s*false,[\s\S]*?isReviewAccount:\s*company\.user\.is_review_account === true/,
    'company report entry point must disable platform approval metrics and preserve its review cohort',
  );
  console.log('company-report-isolation-regression: OK');
}

main();
