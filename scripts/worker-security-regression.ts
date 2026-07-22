const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp') as typeof import('sharp').default;
const { PDFDocument } = require('pdf-lib') as typeof import('pdf-lib');

process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_PRIVATE_UPLOAD_DIR = path.resolve('.tmp/worker-security-private-uploads');
process.env.PRIVATE_DOWNLOAD_SIGNING_SECRET =
  'worker-document-signing-regression-secret-0123456789';

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const {
  createUploadService,
  resolveLocalPrivateDownload,
  resolveLocalPrivateDownloadToken,
} = require('../src/lib/uploads') as typeof import('../src/lib/uploads');
const {
  inspectUpload,
  sanitizePublicImageUpload,
  scanUpload,
} = require('../src/lib/file-security') as typeof import('../src/lib/file-security');
const {
  UpdateWorkerSchema,
} = require('../src/modules/workers/workers.router') as typeof import('../src/modules/workers/workers.router');
const WorkersService = require('../src/modules/workers/workers.service') as typeof import('../src/modules/workers/workers.service');

const workerId = '10000000-0000-4000-8000-000000000001';
const ownerUserId = '20000000-0000-4000-8000-000000000001';
const otherWorkerUserId = '20000000-0000-4000-8000-000000000002';
const companyUserId = '30000000-0000-4000-8000-000000000001';
const companyId = '40000000-0000-4000-8000-000000000001';

const healthCertificateKey =
  `workers/${workerId}/documents/health_certificate/health-certificate.pdf`;
const criminalRecordKey =
  `workers/${workerId}/documents/criminal_record/criminal-record.pdf`;
const leakedPublicUrl = 'https://public-bucket.invalid/workers/private-document.pdf';

const documents = [
  {
    type: 'health_certificate',
    name: 'health-certificate.pdf',
    key: healthCertificateKey,
    url: leakedPublicUrl,
    mime_type: 'application/pdf',
    size_bytes: 512,
    uploaded_at: '2026-07-16T00:00:00.000Z',
    company_visible: true,
    status: 'ready',
    scan_status: 'clean',
    scanner: 'regression-scanner',
    scanned_at: '2026-07-16T00:00:00.000Z',
    content_sha256: 'a'.repeat(64),
  },
  {
    type: 'criminal_record',
    name: 'criminal-record.pdf',
    key: criminalRecordKey,
    mime_type: 'application/pdf',
    size_bytes: 256,
    uploaded_at: '2026-07-16T00:00:00.000Z',
    company_visible: false,
    status: 'ready',
    scan_status: 'clean',
    scanner: 'regression-scanner',
    scanned_at: '2026-07-16T00:00:00.000Z',
    content_sha256: 'b'.repeat(64),
  },
];

const fullWorkerRecord = {
  id: workerId,
  user_id: ownerUserId,
  user: {
    name: 'Worker Security Regression',
    phone: '+994501234567',
    email: 'worker-security@example.invalid',
    email_verified_at: null,
    pending_email: null,
  },
  position: 'Waiter',
  profile_photo_url: 'https://public-cdn.invalid/profile-photo.webp',
  skills: [],
  languages: [],
  documents,
  work_history_summary: null,
  work_history: [],
  gender: null,
  whatsapp_available: false,
  status: 'approved',
  reject_reason: null,
  availability: true,
  worker_class: null,
  is_foc_training: false,
  foc_training_note: null,
  foc_training_updated_at: null,
  foc_training_updated_by_id: null,
  rating_avg: 0,
  rating_count: 0,
  positions: [],
  created_at: new Date('2026-07-16T00:00:00.000Z'),
  updated_at: new Date('2026-07-16T00:00:00.000Z'),
  deleted_at: null,
};

type AsyncMethod = (...args: any[]) => Promise<any>;

async function expectAppError(
  operation: () => Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  await assert.rejects(
    operation,
    (error: any) => error?.statusCode === statusCode && error?.code === code,
  );
}

function assertProtectedDocumentMetadata(profile: any): void {
  assert.ok(Array.isArray(profile.documents));
  const serialized = JSON.stringify(profile.documents);
  assert.equal(serialized.includes(leakedPublicUrl), false);
  assert.equal(serialized.includes(healthCertificateKey), false);
  assert.equal(serialized.includes(criminalRecordKey), false);

  const health = profile.documents.find((document: any) => document.type === 'health_certificate');
  assert.equal(health.available, true);
  assert.equal(health.status, 'ready');
  assert.equal(health.scan_status, 'clean');
  assert.equal(
    health.download_url,
    `/v1/workers/${workerId}/documents/health_certificate/download`,
  );
  assert.equal(health.url, health.download_url);

  const criminal = profile.documents.find((document: any) => document.type === 'criminal_record');
  assert.equal(criminal.available, true);
  assert.equal(criminal.status, 'ready');
  assert.equal(criminal.scan_status, 'clean');
  assert.equal(
    criminal.download_url,
    `/v1/workers/${workerId}/documents/criminal_record/download`,
  );
}

async function withPrismaMethod<T>(
  target: Record<string, unknown>,
  method: string,
  replacement: AsyncMethod,
  operation: () => Promise<T>,
): Promise<T> {
  const original = target[method];
  target[method] = replacement;
  try {
    return await operation();
  } finally {
    target[method] = original;
  }
}

async function testStrictWorkerPatchAllowlist(): Promise<void> {
  const valid = UpdateWorkerSchema.safeParse({
    skills: ['Banquet service'],
    languages: ['az', 'en'],
    availability: true,
    work_history_summary: 'Approved self-service profile field.',
    work_history: [
      {
        company_name: 'Example Hotel',
        position: 'Waiter',
        note: 'Seasonal assignment',
      },
    ],
    gender: 'male',
    whatsapp_available: true,
  });
  assert.equal(valid.success, true);

  const forbiddenFields = [
    'status',
    'worker_class',
    'documents',
    'profile_photo_url',
    'user_id',
    'approved_at',
    'approved_by_id',
    'rejected_at',
    'rejected_by_id',
    'reject_reason',
    'rating_avg',
    'rating_count',
    'is_foc_training',
    'foc_training_note',
    'deleted_at',
    'role',
    'phone',
  ];

  for (const field of forbiddenFields) {
    const result = UpdateWorkerSchema.safeParse({ [field]: 'attacker-controlled-value' });
    assert.equal(result.success, false, `PATCH must reject sensitive field: ${field}`);
  }

  assert.equal(
    UpdateWorkerSchema.safeParse({
      work_history: [{
        company_name: 'Example Hotel',
        position: 'Waiter',
        status: 'approved',
      }],
    }).success,
    false,
    'Nested PATCH objects must also reject unknown fields.',
  );
}

async function testMetadataDoesNotLeakPublicDocumentUrls(): Promise<void> {
  await withPrismaMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findUnique',
    async () => fullWorkerRecord,
    async () => {
      const profile = await WorkersService.getMyWorker(ownerUserId);
      assertProtectedDocumentMetadata(profile);
    },
  );

  await withPrismaMethod(
    prisma.worker as unknown as Record<string, unknown>,
    'findUnique',
    async () => ({
      ...fullWorkerRecord,
      documents: [{
        type: 'health_certificate',
        name: 'legacy-public-document.pdf',
        url: leakedPublicUrl,
        company_visible: true,
      }],
    }),
    async () => {
      const legacyProfile = await WorkersService.getMyWorker(ownerUserId);
      const legacyDocuments = legacyProfile.documents as any[];
      const serialized = JSON.stringify(legacyDocuments);
      assert.equal(serialized.includes(leakedPublicUrl), false);
      assert.equal(legacyDocuments[0].available, false);
      assert.equal(Object.prototype.hasOwnProperty.call(legacyDocuments[0], 'url'), false);
      assert.equal(
        Object.prototype.hasOwnProperty.call(legacyDocuments[0], 'download_url'),
        false,
      );
    },
  );
}

async function testDocumentAuthorization(): Promise<void> {
  const selectedWorker = {
    id: workerId,
    user_id: ownerUserId,
    status: 'approved',
    documents,
  };

  const auditEvents: any[] = [];
  await withPrismaMethod(
    prisma.auditLog as unknown as Record<string, unknown>,
    'create',
    async (query: any) => {
      auditEvents.push(query.data);
      return { id: `audit-${auditEvents.length}` };
    },
    async () => withPrismaMethod(
      prisma.worker as unknown as Record<string, unknown>,
      'findFirst',
      async () => selectedWorker,
      async () => {
      const ownerDownload = await WorkersService.getWorkerDocumentDownload(
        { sub: ownerUserId, role: 'worker' },
        workerId,
        'criminal_record',
      );
      assert.equal(ownerDownload.expires_in_seconds, 300);
      assert.match(ownerDownload.url, /^\/v1\/private-worker-documents\//);

      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: otherWorkerUserId, role: 'worker' },
          workerId,
          'health_certificate',
        ),
        403,
        'WORKER_DOCUMENT_ACCESS_DENIED',
      );

      const adminDownload = await WorkersService.getWorkerDocumentDownload(
        { sub: '50000000-0000-4000-8000-000000000001', role: 'admin' },
        workerId,
        'criminal_record',
      );
      assert.match(adminDownload.url, /^\/v1\/private-worker-documents\//);

      const superAdminDownload = await WorkersService.getWorkerDocumentDownload(
        { sub: '50000000-0000-4000-8000-000000000002', role: 'super_admin' },
        workerId,
        'criminal_record',
      );
      assert.match(superAdminDownload.url, /^\/v1\/private-worker-documents\//);

      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: '60000000-0000-4000-8000-000000000001', role: 'unsupported' },
          workerId,
          'health_certificate',
        ),
        403,
        'WORKER_DOCUMENT_ACCESS_DENIED',
      );

      await withPrismaMethod(
        prisma.company as unknown as Record<string, unknown>,
        'findFirst',
        async () => ({ id: companyId }),
        async () => {
          let assignmentQuery: any;
          await withPrismaMethod(
            prisma.assignment as unknown as Record<string, unknown>,
            'findFirst',
            async (query: any) => {
              assignmentQuery = query;
              return { id: '70000000-0000-4000-8000-000000000001' };
            },
            async () => {
              await expectAppError(
                () => WorkersService.getWorkerDocumentDownload(
                  { sub: companyUserId, role: 'company' },
                  workerId,
                  'criminal_record',
                ),
                403,
                'WORKER_DOCUMENT_ACCESS_DENIED',
              );

              const companyDownload = await WorkersService.getWorkerDocumentDownload(
                { sub: companyUserId, role: 'company' },
                workerId,
                'health_certificate',
              );
              assert.match(companyDownload.url, /^\/v1\/private-worker-documents\//);
            },
          );

          assert.deepEqual(
            assignmentQuery.where.status.in,
            ['assigned', 'accepted', 'completed'],
          );
          assert.equal(assignmentQuery.where.order.company_id, companyId);

          await withPrismaMethod(
            prisma.assignment as unknown as Record<string, unknown>,
            'findFirst',
            async () => null,
            async () => {
              await expectAppError(
                () => WorkersService.getWorkerDocumentDownload(
                  { sub: companyUserId, role: 'company' },
                  workerId,
                  'health_certificate',
                ),
                403,
                'WORKER_DOCUMENT_ACCESS_DENIED',
              );
            },
          );
        },
      );
      },
    ),
  );

  assert.equal(auditEvents.length, 4);
  assert.deepEqual(
    auditEvents.map((event) => event.metadata.event),
    Array(4).fill('document_download_authorized'),
  );
  assert.deepEqual(
    auditEvents.map((event) => event.actor_role),
    ['worker', 'admin', 'super_admin', 'company'],
  );
  for (const event of auditEvents) {
    assert.equal(event.entity_type, 'worker_document');
    assert.equal(event.entity_id, workerId);
    assert.equal(typeof event.metadata.object_key_hash, 'string');
    assert.equal(event.metadata.object_key_hash.length, 64);
  }
}

async function testSignedUrlExpiryAndTamperResistance(): Promise<void> {
  const originalNow = Date.now;
  const issuedAt = Date.parse('2026-07-16T00:00:00.000Z');
  Date.now = () => issuedAt;

  try {
    const signedUrl = await createUploadService().createSignedDownloadUrl(
      healthCertificateKey,
      1,
      '../health-certificate.pdf',
    );
    const token = signedUrl.split('/').pop();
    assert.ok(token);
    assert.equal(
      resolveLocalPrivateDownloadToken(token!),
      path.resolve(process.env.LOCAL_PRIVATE_UPLOAD_DIR!, healthCertificateKey),
    );
    const resolved = resolveLocalPrivateDownload(token!);
    assert.equal(resolved?.downloadName, 'health-certificate.pdf');
    assert.equal(resolved?.downloadName.includes('/'), false);
    assert.equal(resolved?.downloadName.includes('\\'), false);

    const lastCharacter = token!.slice(-1);
    const tamperedToken = `${token!.slice(0, -1)}${lastCharacter === 'a' ? 'b' : 'a'}`;
    assert.equal(resolveLocalPrivateDownloadToken(tamperedToken), null);

    Date.now = () => issuedAt + 2_000;
    assert.equal(resolveLocalPrivateDownloadToken(token!), null);
  } finally {
    Date.now = originalNow;
  }
}

async function testLegacyAndForeignObjectKeysAreNotDownloadable(): Promise<void> {
  const workerTarget = prisma.worker as unknown as Record<string, unknown>;

  await withPrismaMethod(
    workerTarget,
    'findFirst',
    async () => ({
      id: workerId,
      user_id: ownerUserId,
      status: 'approved',
      documents: [{
        type: 'health_certificate',
        url: leakedPublicUrl,
        company_visible: true,
      }],
    }),
    async () => {
      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: ownerUserId, role: 'worker' },
          workerId,
          'health_certificate',
        ),
        410,
        'WORKER_DOCUMENT_REUPLOAD_REQUIRED',
      );
    },
  );

  await withPrismaMethod(
    workerTarget,
    'findFirst',
    async () => ({
      id: workerId,
      user_id: ownerUserId,
      status: 'approved',
      documents: [{
        type: 'health_certificate',
        key: `workers/${otherWorkerUserId}/documents/health_certificate/foreign.pdf`,
        company_visible: true,
      }],
    }),
    async () => {
      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: ownerUserId, role: 'worker' },
          workerId,
          'health_certificate',
        ),
        410,
        'WORKER_DOCUMENT_REUPLOAD_REQUIRED',
      );
    },
  );
}

async function testRejectedAndUnscannedDocumentsAreNotDownloadable(): Promise<void> {
  const workerTarget = prisma.worker as unknown as Record<string, unknown>;

  await withPrismaMethod(
    workerTarget,
    'findFirst',
    async () => ({
      id: workerId,
      user_id: ownerUserId,
      status: 'rejected',
      documents,
    }),
    async () => {
      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: ownerUserId, role: 'worker' },
          workerId,
          'health_certificate',
        ),
        410,
        'WORKER_DOCUMENT_REJECTED',
      );
    },
  );

  await withPrismaMethod(
    workerTarget,
    'findFirst',
    async () => ({
      id: workerId,
      user_id: ownerUserId,
      status: 'approved',
      documents: [{
        ...documents[0],
        status: 'quarantine',
        scan_status: 'pending',
      }],
    }),
    async () => {
      await expectAppError(
        () => WorkersService.getWorkerDocumentDownload(
          { sub: ownerUserId, role: 'worker' },
          workerId,
          'health_certificate',
        ),
        410,
        'WORKER_DOCUMENT_SCAN_REQUIRED',
      );
    },
  );
}

function uploadFile(
  originalname: string,
  mimetype: string,
  buffer: Buffer,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    destination: '',
    filename: originalname,
    path: '',
    buffer,
    stream: undefined as never,
  };
}

async function validPdfBuffer(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  return Buffer.from(await document.save());
}

async function expectUploadError(
  file: Express.Multer.File,
  allowed: ReadonlySet<string>,
  statusCode: number,
  code: string,
): Promise<void> {
  await expectAppError(() => inspectUpload(file, allowed), statusCode, code);
}

async function testUploadContentValidation(): Promise<void> {
  const images = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const documentsOnly = new Set(['application/pdf']);
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 180, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();
  const inspectedPng = await inspectUpload(uploadFile('../profile.PNG', 'image/png', png), images);
  assert.equal(inspectedPng.detectedMimeType, 'image/png');
  assert.equal(inspectedPng.safeOriginalName, 'profile.png');
  assert.equal(inspectedPng.sha256.length, 64);

  const pdf = await validPdfBuffer();
  const inspectedPdf = await inspectUpload(
    uploadFile('health-certificate.pdf', 'application/pdf', pdf),
    documentsOnly,
  );
  assert.equal(inspectedPdf.detectedMimeType, 'application/pdf');

  await expectUploadError(
    uploadFile('fake.png', 'image/png', Buffer.from('<svg><script>alert(1)</script></svg>')),
    images,
    415,
    'UPLOAD_ACTIVE_CONTENT_BLOCKED',
  );
  await expectUploadError(
    uploadFile('malware.png', 'image/png', Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
    images,
    415,
    'UPLOAD_EXECUTABLE_BLOCKED',
  );
  await expectUploadError(
    uploadFile('archive.png', 'image/png', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
    images,
    415,
    'UPLOAD_EXECUTABLE_BLOCKED',
  );
  await expectUploadError(
    uploadFile('profile.jpg', 'image/jpeg', png),
    images,
    415,
    'UPLOAD_MIME_MISMATCH',
  );
  await expectUploadError(
    uploadFile('profile.jpg', 'image/png', png),
    images,
    415,
    'UPLOAD_EXTENSION_MISMATCH',
  );
  await expectUploadError(
    uploadFile('polyglot.png', 'image/png', Buffer.concat([png, Buffer.from('trailing-payload')])),
    images,
    422,
    'UPLOAD_POLYGLOT_BLOCKED',
  );
  await expectUploadError(
    uploadFile(
      'active.pdf',
      'application/pdf',
      Buffer.concat([pdf.subarray(0, pdf.lastIndexOf(Buffer.from('%%EOF'))), Buffer.from('/JavaScript\n%%EOF')]),
    ),
    documentsOnly,
    422,
    'UPLOAD_PDF_ACTIVE_CONTENT',
  );
  await expectUploadError(
    uploadFile('corrupt.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n1 0 obj\nbroken\n%%EOF')),
    documentsOnly,
    422,
    'UPLOAD_PDF_INVALID',
  );
  await expectUploadError(
    { ...uploadFile('profile.png', 'image/png', png), size: png.length + 1 },
    images,
    400,
    'UPLOAD_SIZE_MISMATCH',
  );
}

async function testPublicImageMetadataIsStrippedBeforeStorage(): Promise<void> {
  const jpegWithExif = await sharp({
    create: {
      width: 16,
      height: 8,
      channels: 3,
      background: { r: 30, g: 80, b: 120 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6, density: 300 })
    .toBuffer();

  const originalMetadata = await sharp(jpegWithExif).metadata();
  assert.ok(originalMetadata.exif, 'The fixture must contain EXIF metadata.');
  assert.equal(originalMetadata.orientation, 6);

  const originalInspection = await inspectUpload(
    uploadFile('profile.jpg', 'image/jpeg', jpegWithExif),
    new Set(['image/jpeg']),
  );
  const sanitized = await sanitizePublicImageUpload(jpegWithExif, originalInspection);
  const sanitizedMetadata = await sharp(sanitized.body).metadata();

  assert.equal(sanitizedMetadata.exif, undefined);
  assert.equal(sanitizedMetadata.orientation, undefined);
  assert.equal(sanitized.inspection.sizeBytes, sanitized.body.length);
  assert.equal(
    sanitized.inspection.sha256,
    nodeCrypto.createHash('sha256').update(sanitized.body).digest('hex'),
  );
  assert.notEqual(sanitized.inspection.sha256, originalInspection.sha256);
}

async function testSensitiveScannerFailClosedAndMalwareRejection(): Promise<void> {
  const png = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  }).png().toBuffer();
  const inspection = await inspectUpload(
    uploadFile('document.png', 'image/png', png),
    new Set(['image/png']),
  );
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    MALWARE_SCANNER_PROVIDER: process.env.MALWARE_SCANNER_PROVIDER,
    MALWARE_SCAN_REQUIRED: process.env.MALWARE_SCAN_REQUIRED,
    MALWARE_SCANNER_URL: process.env.MALWARE_SCANNER_URL,
    MALWARE_SCANNER_MAX_ATTEMPTS: process.env.MALWARE_SCANNER_MAX_ATTEMPTS,
  };
  const originalFetch = global.fetch;

  try {
    process.env.NODE_ENV = 'production';
    process.env.MALWARE_SCANNER_PROVIDER = 'disabled';
    delete process.env.MALWARE_SCAN_REQUIRED;
    await expectAppError(
      () => scanUpload(png, inspection, { sensitive: true }),
      503,
      'MALWARE_SCANNER_UNAVAILABLE',
    );

    process.env.NODE_ENV = 'test';
    process.env.MALWARE_SCANNER_PROVIDER = 'http';
    process.env.MALWARE_SCANNER_URL = 'https://scanner.example.invalid/scan';
    process.env.MALWARE_SCANNER_MAX_ATTEMPTS = '1';
    let scannerRequest: RequestInit | undefined;
    global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      scannerRequest = init;
      return new Response(
        JSON.stringify({ status: 'infected', scanner: 'regression-scanner' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;
    await expectAppError(
      () => scanUpload(png, inspection, { sensitive: true }),
      422,
      'UPLOAD_MALWARE_DETECTED',
    );
    assert.equal(scannerRequest?.redirect, 'error');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function testLocalQuarantinePromotionAndCleanup(): Promise<void> {
  const root = path.resolve(process.env.LOCAL_PRIVATE_UPLOAD_DIR!);
  const service = createUploadService();
  const sourceKey = `workers/${workerId}/quarantine/regression-source.pdf`;
  const targetKey = `workers/${workerId}/documents/health_certificate/regression-final.pdf`;
  const sourcePath = path.resolve(root, sourceKey);
  const targetPath = path.resolve(root, targetKey);
  await fs.rm(root, { recursive: true, force: true });

  try {
    await service.putPrivateObject({
      key: sourceKey,
      contentType: 'application/pdf',
      body: Buffer.from('quarantine-regression'),
      downloadName: 'health-certificate.pdf',
    });
    await service.promotePrivateObject(sourceKey, targetKey);
    assert.equal(await fs.readFile(targetPath, 'utf8'), 'quarantine-regression');
    await assert.rejects(() => fs.access(sourcePath), (error: any) => error?.code === 'ENOENT');

    await service.deleteObject(targetKey, 'private');
    await assert.rejects(() => fs.access(targetPath), (error: any) => error?.code === 'ENOENT');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testStrictWorkerPatchAllowlist();
  await testMetadataDoesNotLeakPublicDocumentUrls();
  await testDocumentAuthorization();
  await testSignedUrlExpiryAndTamperResistance();
  await testLegacyAndForeignObjectKeysAreNotDownloadable();
  await testRejectedAndUnscannedDocumentsAreNotDownloadable();
  await testUploadContentValidation();
  await testPublicImageMetadataIsStrippedBeforeStorage();
  await testSensitiveScannerFailClosedAndMalwareRejection();
  await testLocalQuarantinePromotionAndCleanup();
  console.log('worker-security-regression: OK');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
