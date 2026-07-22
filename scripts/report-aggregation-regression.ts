import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function main(): void {
  const source = fs.readFileSync(path.resolve('src/modules/reports/reports.service.ts'), 'utf8');
  assert.match(
    source,
    /prisma\.attendanceLog\.groupBy\(\{\s*by: \['assignment_id'\]/,
    'completed work counts must be aggregated in PostgreSQL before relation hydration',
  );
  assert.match(
    source,
    /prisma\.order\.groupBy\(\{\s*by: \['company_id'\]/,
    'company usage must be aggregated in PostgreSQL',
  );
  assert.equal(
    /workerWorkRows[\s\S]*?prisma\.attendanceLog\.findMany/.test(source),
    false,
    'reports must not load every completed attendance row',
  );
  assert.equal(
    /companyUsageRows[\s\S]*?prisma\.order\.findMany/.test(source),
    false,
    'reports must not load every order solely to count company usage',
  );
  console.log('report-aggregation-regression: OK');
}

main();
