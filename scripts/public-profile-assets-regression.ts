import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const uploadRoot = path.resolve('.tmp/public-profile-assets-regression');
const workerId = '10000000-0000-4000-8000-000000000001';
const photoId = '20000000-0000-4000-8000-000000000001';
const photoKey = `workers/${workerId}/profile-photo/${photoId}.png`;
const photoBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_UPLOAD_DIR = uploadRoot;

async function main(): Promise<void> {
  await fs.mkdir(path.dirname(path.join(uploadRoot, photoKey)), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, photoKey), photoBytes);

  const { default: app } = await import('../src/app');
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const image = await fetch(`${baseUrl}/uploads/${photoKey}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), photoBytes);

    const missing = await fetch(
      `${baseUrl}/uploads/workers/${workerId}/profile-photo/30000000-0000-4000-8000-000000000001.png`,
    );
    assert.equal(missing.status, 404);

    const privateDocument = await fetch(
      `${baseUrl}/uploads/workers/${workerId}/documents/health_certificate/private.pdf`,
    );
    assert.equal(privateDocument.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await fs.rm(uploadRoot, { recursive: true, force: true });
  }

  console.log('public-profile-assets-regression: OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
