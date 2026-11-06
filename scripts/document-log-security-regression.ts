import assert from 'node:assert/strict';
import { logger, redactSensitive } from '../src/lib/logger';

const signed = 'https://storage.example.test/private/health.pdf?X-Amz-Credential=test-key&X-Amz-Signature=test-signature';
const r2 = 'https://example-account.r2.cloudflarestorage.com/private-bucket/workers/worker/documents/cv/resume.pdf';
const data = redactSensitive({
  message: `Storage failed for ${signed} and ${r2}`,
  nested: { download_url: signed, object_key: 'private-key', s3_bucket: 'private-bucket', access_key_id: 'test-key' },
  error: { message: signed },
  object_key_hash: 'audit-hash-is-safe',
}) as Record<string, unknown>;
const encoded = JSON.stringify(data);
for (const sensitive of ['test-signature', 'test-key', 'private-key', 'private-bucket', 'example-account', 'health.pdf']) {
  assert.ok(!encoded.includes(sensitive), `sensitive document value escaped redaction: ${sensitive}`);
}
assert.equal(data.object_key_hash, 'audit-hash-is-safe');
const output: string[] = [];
const original = console.error;
try {
  console.error = (line: string) => { output.push(line); };
  logger.error(`download failed: ${signed}`, { url: r2 });
} finally {
  console.error = original;
}
assert.equal(output.length, 1);
assert.ok(!output[0].includes('X-Amz-'));
assert.ok(!output[0].includes('example-account'));
assert.ok(output[0].includes('[redacted-document-url]'));

// Capture the actual instrumentation callbacks without initializing telemetry
// or transmitting test data. Transactions do not pass through beforeSend.
const moduleLoader = require('node:module');
const originalLoad = moduleLoader._load;
let sentryOptions: Record<string, any> | undefined;
try {
  moduleLoader._load = function(request: string, ...args: unknown[]) {
    if (request === '@sentry/node') {
      return { init(options: Record<string, any>) { sentryOptions = options; } };
    }
    return originalLoad.call(this, request, ...args);
  };
  delete require.cache[require.resolve('../src/instrument')];
  require('../src/instrument');
} finally {
  moduleLoader._load = originalLoad;
}
assert.ok(sentryOptions);
for (const hook of ['beforeSend', 'beforeSendTransaction']) {
  assert.equal(typeof sentryOptions[hook], 'function');
  const filtered: Record<string, any> = sentryOptions[hook]({
    ...(hook === 'beforeSendTransaction' ? { type: 'transaction' } : {}),
    request: {
      url: 'https://api.example.invalid/v1/private-worker-documents/local-secret?token=query-secret',
      data: 'private-body', cookies: 'private-cookie', query_string: 'query-secret',
      headers: { authorization: 'Bearer private-auth', 'x-kiosk-capability': 'private-capability', accept: 'application/json' },
    },
    user: { id: 'safe-user-id', email: 'private-user@example.invalid' },
    spans: [{ description: `GET ${r2}`, data: {
      'http.url': r2, 'url.full': signed,
      'url.path': '/private-bucket/workers/worker/documents/cv/private-filename.pdf',
      'url.query': '?X-Amz-Credential=test-key&X-Amz-Signature=test-signature',
      'server.address': 'example-account.r2.cloudflarestorage.com',
      'aws.s3.bucket': 'private-bucket', 'aws.s3.key': 'private-filename.pdf',
      'aws.s3.copy_source': 'private-bucket/private-filename.pdf',
      'aws.s3.upload_id': 'private-upload-id',
      object_key_hash: 'safe-object-hash',
    } }],
  });
  const serialized = JSON.stringify(filtered);
  for (const secret of ['local-secret', 'query-secret', 'private-body', 'private-cookie',
    'private-auth', 'private-capability', 'private-user', 'example-account', 'private-bucket', 'test-key',
    'test-signature', 'private-filename', 'private-upload-id']) {
    assert.ok(!serialized.includes(secret), `${hook} leaked ${secret}`);
  }
  assert.deepEqual(filtered.user, { id: 'safe-user-id' });
  assert.equal(filtered.request.headers.accept, 'application/json');
  assert.equal(filtered.spans[0].data.object_key_hash, 'safe-object-hash');
  if (hook === 'beforeSendTransaction') assert.equal(filtered.type, 'transaction');
}
const breadcrumb = sentryOptions.beforeBreadcrumb({ data: { url: signed } });
assert.ok(!JSON.stringify(breadcrumb).includes('test-signature'));
console.log('Document logging regression: PASS (signed URLs, R2 locators, nested secrets, logger, Sentry errors/transactions/breadcrumbs).');
