import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
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
const oversizedPhotoId = '20000000-0000-4000-8000-000000000002';
const oversizedPhotoKey = `workers/${workerId}/profile-photo/${oversizedPhotoId}.png`;

process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_UPLOAD_DIR = uploadRoot;

async function rawRequest(port: number, requestPath: string): Promise<{
  status: number;
  contentType: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: requestPath,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        contentType: String(response.headers['content-type'] ?? ''),
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

function assertJsonError(
  response: { status: number; contentType: string; body: string },
  status: number,
  code: string,
): void {
  assert.equal(response.status, status);
  assert.match(response.contentType, /^application\/json\b/i);
  assert.equal(JSON.parse(response.body).code, code);
}

async function main(): Promise<void> {
  await fs.mkdir(path.dirname(path.join(uploadRoot, photoKey)), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, photoKey), photoBytes);
  await fs.writeFile(
    path.join(uploadRoot, oversizedPhotoKey),
    Buffer.alloc((5 * 1024 * 1024) + 1),
  );

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
    assert.match(missing.headers.get('content-type') ?? '', /^application\/json\b/i);
    assert.equal((await missing.json() as { code: string }).code, 'PROFILE_PHOTO_NOT_FOUND');

    const privateDocument = await fetch(
      `${baseUrl}/uploads/workers/${workerId}/documents/health_certificate/private.pdf`,
    );
    assert.equal(privateDocument.status, 404);
    assert.match(privateDocument.headers.get('content-type') ?? '', /^application\/json\b/i);

    const arbitraryObject = await fetch(`${baseUrl}/uploads/public/anything.png`);
    assert.equal(arbitraryObject.status, 404);
    assert.equal(
      (await arbitraryObject.json() as { code: string }).code,
      'PROFILE_PHOTO_NOT_FOUND',
    );

    const traversal = await rawRequest(
      address.port,
      `/uploads/workers/${workerId}/profile-photo/%2e%2e%2fdocuments%2fhealth_certificate%2fprivate.pdf`,
    );
    assertJsonError(traversal, 404, 'PROFILE_PHOTO_NOT_FOUND');

    const oversized = await fetch(`${baseUrl}/uploads/${oversizedPhotoKey}`);
    assert.equal(oversized.status, 413);
    assert.match(oversized.headers.get('content-type') ?? '', /^application\/json\b/i);
    assert.equal(
      (await oversized.json() as { code: string }).code,
      'PROFILE_PHOTO_TOO_LARGE',
    );

    const storageFailureId = '20000000-0000-4000-8000-000000000003';
    const storageFailureKey = `workers/${workerId}/profile-photo/${storageFailureId}.png`;
    await fs.mkdir(path.join(uploadRoot, storageFailureKey), { recursive: true });
    const storageFailure = await fetch(`${baseUrl}/uploads/${storageFailureKey}`);
    assert.equal(storageFailure.status, 500);
    assert.match(storageFailure.headers.get('content-type') ?? '', /^application\/json\b/i);
    assert.equal(
      (await storageFailure.json() as { code: string }).code,
      'INTERNAL_ERROR',
    );
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
