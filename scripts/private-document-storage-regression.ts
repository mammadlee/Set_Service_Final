import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument } from 'pdf-lib';

// All storage I/O and DB calls below are in-process fakes. The real AWS signer,
// upload adapter, authorization service, file validator and scanner path run.
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.STORAGE_PROVIDER = 'r2';
process.env.S3_ENDPOINT = 'https://storage-regression.r2.cloudflarestorage.com';
process.env.S3_BUCKET = 'private-regression';
process.env.S3_REGION = 'auto';
process.env.S3_ACCESS_KEY_ID = '0123456789abcdef0123456789abcdef';
process.env.S3_SECRET_ACCESS_KEY = 'storage-regression-only-credential-0123456789';
process.env.STORAGE_PUBLIC_BASE_URL = 'https://api.example.invalid/uploads';
process.env.STORAGE_SIGNED_URL_TTL_SECONDS = '300';
process.env.MALWARE_SCANNER_PROVIDER = 'http';
process.env.MALWARE_SCANNER_URL = 'https://scanner.example.invalid/scan';
process.env.MALWARE_SCAN_REQUIRED = 'true';
process.env.MALWARE_SCANNER_MAX_ATTEMPTS = '1';
process.env.JWT_ACCESS_SECRET = 'document-storage-regression-jwt-0123456789';

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const uploads = require('../src/lib/uploads') as typeof import('../src/lib/uploads');
const service = require('../src/modules/workers/workers.service') as typeof import('../src/modules/workers/workers.service');
const workerId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const key = `workers/${workerId}/documents/cv/iş-təcrübəsi.pdf`;
let tests = 0;

async function check(name: string, run: () => Promise<void>): Promise<void> {
  await run(); tests += 1; console.log(`PASS ${name}`);
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function verifySignature(url: URL): void {
  const signature = url.searchParams.get('X-Amz-Signature');
  const credential = url.searchParams.get('X-Amz-Credential')!;
  const [access, date, region, svc, terminator] = credential.split('/');
  assert.equal(access, process.env.S3_ACCESS_KEY_ID);
  assert.equal(region, 'auto');
  assert.equal(svc, 's3');
  assert.equal(terminator, 'aws4_request');
  const query = [...url.searchParams].filter(([name]) => name !== 'X-Amz-Signature')
    .map(([name, value]) => [encode(name), encode(value)])
    .sort(([an, av], [bn, bv]) => an < bn ? -1 : an > bn ? 1 : av < bv ? -1 : 1)
    .map(([name, value]) => `${name}=${value}`).join('&');
  const canonical = ['GET', url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Date'),
    `${date}/${region}/${svc}/${terminator}`, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');
  let derived: crypto.BinaryLike = `AWS4${process.env.S3_SECRET_ACCESS_KEY}`;
  for (const part of [date, region, svc, terminator]) derived = crypto.createHmac('sha256', derived).update(part).digest();
  assert.equal(signature, crypto.createHmac('sha256', derived).update(toSign).digest('hex'));
}

async function main(): Promise<void> {
  const pdf = await PDFDocument.create(); pdf.addPage([200, 200]);
  const bytes = Buffer.from(await pdf.save());
  const originalSend = S3Client.prototype.send;
  const originalFetch = globalThis.fetch;
  const originals = [prisma.worker.findFirst, prisma.worker.findUnique, prisma.auditLog.create,
    prisma.company.findFirst, prisma.assignment.findFirst];
  let body = bytes;
  let mode: 'ok' | 'denied' | 'missing' | 'large' | 'chunked-large' = 'ok';
  const commands: any[] = [];
  let scans = 0;
  let scannerStatus = 'clean';
  let document: Record<string, any> = { type: 'cv', key, name: 'iş-təcrübəsi.pdf', status: 'ready', scan_status: 'clean' };
  const record = () => ({ id: workerId, user_id: userId, status: 'approved', documents: [document],
    user: { name: 'Test Worker', phone: '+994700000003', email: null }, positions: [], skills: [], languages: [], work_history: [] });
  const audits: any[] = [];
  (prisma.worker as any).findFirst = async () => record();
  (prisma.worker as any).findUnique = async () => record();
  (prisma.auditLog as any).create = async (input: any) => { audits.push(input); return {}; };
  (prisma.company as any).findFirst = async () => ({ id: 'company-1' });
  (prisma.assignment as any).findFirst = async () => ({ id: 'assignment-1' });
  (S3Client.prototype as any).send = async (command: any) => {
    commands.push(command);
    assert.equal(command.input.Bucket, process.env.S3_BUCKET);
    if (mode === 'denied') throw Object.assign(new Error('private provider details must not escape'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    if (mode === 'missing') throw Object.assign(new Error('missing private key'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
    if (command instanceof HeadObjectCommand) return { ContentLength: mode === 'large' ? 6 * 1024 * 1024 : body.length };
    assert.ok(command instanceof GetObjectCommand, 'No storage mutations are allowed in download flow.');
    const content = mode === 'chunked-large' ? [Buffer.alloc(3 * 1024 * 1024), Buffer.alloc(3 * 1024 * 1024)] : [body];
    return { ContentLength: mode === 'large' ? 6 * 1024 * 1024 : undefined,
      ContentType: 'application/pdf', Body: Readable.from(content) };
  };
  globalThis.fetch = async (_input, init) => {
    scans += 1;
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(Buffer.from(init?.body as Buffer), body);
    return new Response(JSON.stringify({ status: scannerStatus, scanner: 'test-only-scanner' }), { status: 200 });
  };
  const download = () => service.getWorkerDocumentDownload({ sub: userId, role: 'worker' }, workerId, document.type);
  const expectCode = (operation: () => Promise<unknown>, code: string) => assert.rejects(operation, (e: any) => e.code === code);
  try {
    await check('private R2 download signs exact API host, bucket, Unicode object key and short expiry', async () => {
      const result = await download(); const url = new URL(result.url);
      assert.equal(url.origin, process.env.S3_ENDPOINT);
      assert.equal(decodeURIComponent(url.pathname), `/${process.env.S3_BUCKET}/${key}`);
      assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
      assert.equal(url.searchParams.get('response-content-type'), 'application/pdf');
      assert.match(url.searchParams.get('response-content-disposition')!, /^attachment;/);
      assert.equal(url.searchParams.get('response-cache-control'), 'private, no-store, max-age=0');
      verifySignature(url);
      assert.equal(commands.length, 1); assert.ok(commands[0] instanceof HeadObjectCommand);
      assert.equal(scans, 0, 'Ready documents already scanned at upload.');
    });
    await check('another worker is denied before storage access', async () => {
      const before = commands.length;
      await expectCode(() => service.getWorkerDocumentDownload({ sub: 'other', role: 'worker' }, workerId, 'cv'), 'WORKER_DOCUMENT_ACCESS_DENIED');
      assert.equal(commands.length, before);
    });
    await check('company cannot download CV or criminal record even with an assignment', async () => {
      for (const type of ['cv', 'criminal_record']) await expectCode(() => service.getWorkerDocumentDownload({ sub: 'company-user', role: 'company' }, workerId, type), 'WORKER_DOCUMENT_ACCESS_DENIED');
    });
    await check('admin may get signed URL, audit never stores signed URL/key/credentials', async () => {
      await service.getWorkerDocumentDownload({ sub: 'admin-user', role: 'admin' }, workerId, 'cv');
      const serialized = JSON.stringify(audits);
      for (const forbidden of [key, 'X-Amz-', process.env.S3_ACCESS_KEY_ID!, process.env.S3_ENDPOINT!]) assert.equal(serialized.includes(forbidden), false);
    });
    await check('legacy raw and expired signed R2 URLs resolve through authorization and a new scan', async () => {
      const signed = await download();
      const before = scans;
      for (const url of [`${process.env.STORAGE_PUBLIC_BASE_URL}/${key}`, `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`, signed.url.replace(/X-Amz-Date=[^&]+/, 'X-Amz-Date=20200101T000000Z')]) {
        document = { type: 'cv', url, name: 'iş-təcrübəsi.pdf' };
        const snapshot = JSON.stringify(document);
        const metadata = (await service.getMyWorker(userId)).documents as any[];
        assert.equal(metadata[0].available, true);
        assert.equal(metadata[0].status, 'legacy'); assert.equal(metadata[0].scan_status, 'unscanned');
        assert.match(metadata[0].download_url, /^\/v1\/workers\//);
        assert.equal(JSON.stringify(metadata).includes('X-Amz-'), false);
        const result = await download(); verifySignature(new URL(result.url));
        assert.equal(JSON.stringify(document), snapshot, 'Legacy read does not mutate metadata.');
        assert.notEqual(new URL(result.url).searchParams.get('X-Amz-Date'), '20200101T000000Z');
      }
      assert.equal(scans, before + 3);
    });
    await check('untrusted legacy host, foreign key, traversal and quarantine never read or sign objects', async () => {
      for (const candidate of [
        { url: `https://evil.invalid/${key}` },
        { key: `workers/another-worker/documents/cv/file.pdf` },
        { key: `workers/${workerId}/documents/cv/../criminal_record/file.pdf` },
        { key: `workers/${workerId}/documents/cv/%2e%2e%2fsecret.pdf` },
        { key: `workers/${workerId}/quarantine/file.pdf` },
      ]) {
        document = { type: 'cv', ...candidate }; const before = commands.length;
        await expectCode(download, 'WORKER_DOCUMENT_REUPLOAD_REQUIRED'); assert.equal(commands.length, before);
      }
      document = { type: 'cv', key, status: 'quarantine', scan_status: 'pending' };
      await expectCode(download, 'WORKER_DOCUMENT_SCAN_REQUIRED');
      for (const flags of [{ status: 'blocked' }, { scan_status: 'unsafe' }, { status: null }]) {
        document = { type: 'cv', key, ...flags };
        const before = commands.length;
        await expectCode(download, 'WORKER_DOCUMENT_SCAN_REQUIRED');
        assert.equal(commands.length, before, 'Explicit unknown states must not become legacy.');
      }
    });
    await check('legacy malware never receives a signed URL', async () => {
      document = { type: 'cv', key }; scannerStatus = 'infected';
      const before = commands.length;
      await expectCode(download, 'UPLOAD_MALWARE_DETECTED');
      assert.equal(commands.slice(before).some(c => c instanceof HeadObjectCommand), false);
      scannerStatus = 'clean';
    });
    await check('missing and denied R2 objects return safe API errors without provider details', async () => {
      document = { type: 'cv', key, status: 'ready', scan_status: 'clean' };
      mode = 'missing'; await expectCode(download, 'WORKER_DOCUMENT_NOT_FOUND');
      mode = 'denied'; await assert.rejects(download, (e: any) => e.code === 'WORKER_DOCUMENT_STORAGE_UNAVAILABLE' && !e.message.includes('private provider'));
      mode = 'ok';
    });
    await check('large objects are rejected by metadata and by streamed bytes', async () => {
      mode = 'large'; await expectCode(download, 'UPLOAD_FILE_TOO_LARGE');
      document = { type: 'cv', key }; mode = 'chunked-large';
      await expectCode(download, 'UPLOAD_FILE_TOO_LARGE'); mode = 'ok';
    });
    await check('assigned company can read only explicitly visible health certificate', async () => {
      document = { type: 'health_certificate', key: key.replace('/cv/', '/health_certificate/'), status: 'ready', scan_status: 'clean', company_visible: true };
      await service.getWorkerDocumentDownload({ sub: 'company-user', role: 'company' }, workerId, document.type);
      (prisma.assignment as any).findFirst = async () => null;
      await expectCode(() => service.getWorkerDocumentDownload({ sub: 'company-user', role: 'company' }, workerId, document.type), 'WORKER_DOCUMENT_ACCESS_DENIED');
    });
    await check('invalid R2 endpoint does not sign public custom domain or duplicate bucket path', async () => {
      const previous = process.env.S3_ENDPOINT;
      try {
        for (const endpoint of ['https://public.r2.dev', `${previous}/${process.env.S3_BUCKET}`, `${previous}:8443`, 'http://storage-regression.r2.cloudflarestorage.com']) {
          process.env.S3_ENDPOINT = endpoint;
          assert.throws(() => uploads.createUploadService(), uploads.UploadStorageUnavailableError);
        }
      } finally { process.env.S3_ENDPOINT = previous; }
    });
    await check('signed link lifetime cannot exceed fifteen minutes', async () => {
      for (const ttl of [0, 901, 2.5]) await assert.rejects(() => uploads.createUploadService().createSignedDownloadUrl(key, ttl));
    });
    await check('HTTP download requires authentication and current admin view_workers permission', async () => {
      const express = require('express') as typeof import('express');
      const router = require('../src/modules/workers/workers.router').default;
      const { errorHandler } = require('../src/middleware/errorHandler') as typeof import('../src/middleware/errorHandler');
      const { signAccessToken } = require('../src/lib/jwt') as typeof import('../src/lib/jwt');
      const app = express(); app.use('/v1', router); app.use(errorHandler);
      const server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as import('node:net').AddressInfo).port;
      const endpoint = `http://127.0.0.1:${port}/v1/workers/${workerId}/documents/cv/download`;
      const originalFindUser = prisma.user.findUnique;
      let permissions: string[] = [];
      let role: 'admin' | 'super_admin' = 'admin';
      (prisma.user as any).findUnique = async () => ({ role, is_active: true, deleted_at: null,
        session_version: 0, admin: { permissions } });
      document = { type: 'cv', key, status: 'ready', scan_status: 'clean' };
      try {
        assert.equal((await originalFetch(endpoint)).status, 401);
        const before = commands.length;
        const headers = () => ({ Authorization: `Bearer ${signAccessToken({ sub: 'admin-regression', role })}` });
        const denied = await originalFetch(endpoint, { headers: headers() });
        assert.equal(denied.status, 403);
        assert.equal((await denied.json() as any).code, 'PERMISSION_DENIED');
        assert.equal(commands.length, before);
        permissions = ['view_workers'];
        const allowed = await originalFetch(endpoint, { headers: headers() });
        assert.equal(allowed.status, 200);
        assert.match(allowed.headers.get('Cache-Control')!, /no-store/);
        verifySignature(new URL((await allowed.json() as any).url));
        permissions = []; role = 'super_admin';
        assert.equal((await originalFetch(endpoint, { headers: headers() })).status, 200);
      } finally {
        prisma.user.findUnique = originalFindUser;
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    });
    console.log(`private-document-storage-regression: ${tests} PASS (mock R2/DB; no live access)`);
  } finally {
    S3Client.prototype.send = originalSend; globalThis.fetch = originalFetch;
    [prisma.worker.findFirst, prisma.worker.findUnique, prisma.auditLog.create, prisma.company.findFirst, prisma.assignment.findFirst] = originals as any;
    await prisma.$disconnect();
  }
}
main().catch(() => { console.error('private-document-storage-regression: FAILED (details suppressed to protect signed URL fixtures)'); process.exitCode = 1; });
