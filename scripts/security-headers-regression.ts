import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.OUTBOX_WORKER_ENABLED = 'false';
process.env.SWAGGER_DOCS_ENABLED = 'false';

const requiredWebHeaders = [
  "Content-Security-Policy: default-src 'self'",
  "frame-ancestors 'none'",
  'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy: no-referrer',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
];

async function main(): Promise<void> {
  const { default: app } = await import('../src/app');
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=/);
    assert.equal(
      response.headers.get('permissions-policy'),
      'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  for (const appName of ['admin_panel', 'company_dashboard', 'qr_kiosk']) {
    const policy = fs.readFileSync(path.resolve(`apps/${appName}/public/_headers`), 'utf8');
    for (const expected of requiredWebHeaders) {
      assert.ok(policy.includes(expected), `${appName} is missing ${expected}`);
    }
  }
  console.log('security-headers-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
