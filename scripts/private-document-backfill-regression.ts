const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.STORAGE_PUBLIC_BASE_URL = 'https://cdn.example.invalid/uploads';

const {
  assertBackfillExecutionAllowed,
  documentRequiresBackfill,
  extractPublicObjectKey,
  isReadyPrivateDocument,
  parseOptions,
} = require('./private-document-backfill') as typeof import('./private-document-backfill');

const workerId = '10000000-0000-4000-8000-000000000001';

function main(): void {
  assert.deepEqual(parseOptions([]), {
    execute: false,
    cleanupOrphans: false,
    olderThanHours: 168,
  });
  assert.deepEqual(parseOptions(['--execute', '--cleanup-orphans', '--older-than-hours=24']), {
    execute: true,
    cleanupOrphans: true,
    olderThanHours: 24,
  });
  assert.throws(() => parseOptions(['--cleanup-orphans']));
  assert.throws(() => parseOptions(['--older-than-hours=0']));

  assert.equal(
    extractPublicObjectKey('https://cdn.example.invalid/uploads/workers/a/document.pdf'),
    'workers/a/document.pdf',
  );
  assert.equal(
    extractPublicObjectKey('/uploads/workers/a/document.pdf?download=1', '/uploads'),
    'workers/a/document.pdf',
  );
  assert.equal(
    extractPublicObjectKey('https://attacker.invalid/uploads/workers/a/document.pdf'),
    null,
  );
  assert.equal(
    extractPublicObjectKey('https://cdn.example.invalid/uploads/%2e%2e/private/secret.pdf'),
    null,
  );

  const readyDocument = {
    type: 'health_certificate',
    key: `workers/${workerId}/documents/health_certificate/random.pdf`,
    status: 'ready',
    scan_status: 'clean',
  };
  assert.equal(isReadyPrivateDocument(readyDocument, workerId), true);
  assert.equal(documentRequiresBackfill({ ...readyDocument, url: 'https://cdn.example.invalid/old.pdf' }, workerId), false);
  assert.equal(
    documentRequiresBackfill({
      type: 'health_certificate',
      url: 'https://cdn.example.invalid/uploads/workers/a/document.pdf',
    }, workerId),
    true,
  );

  const previousNodeEnv = process.env.NODE_ENV;
  const previousGuard = process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL;
    assert.doesNotThrow(() => assertBackfillExecutionAllowed(parseOptions([])));
    assert.throws(() => assertBackfillExecutionAllowed(parseOptions(['--execute'])));
    process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL = 'true';
    assert.doesNotThrow(() => assertBackfillExecutionAllowed(parseOptions(['--execute'])));
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousGuard === undefined) delete process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL;
    else process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL = previousGuard;
  }

  console.log('private-document-backfill-regression: OK');
}

main();
