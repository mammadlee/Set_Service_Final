const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_PUBLIC_BASE_URL = '/uploads';

const uploads = require('../src/lib/uploads') as typeof import('../src/lib/uploads');
const deletedObjects: Array<{ key: string; visibility: 'public' | 'private' }> = [];
const originalCreateUploadService = uploads.createUploadService;
(uploads as any).createUploadService = () => ({
  deleteObject: async (key: string, visibility: 'public' | 'private') => {
    deletedObjects.push({ key, visibility });
  },
});

const { prisma } = require('../src/lib/prisma') as typeof import('../src/lib/prisma');
const WorkersService = require('../src/modules/workers/workers.service') as typeof import('../src/modules/workers/workers.service');
const {
  deliverStorageCleanupOutboxEvent,
} = require('../src/lib/storage-cleanup-outbox') as typeof import('../src/lib/storage-cleanup-outbox');
const {
  WorkerAccountDeletionRequestSchema,
} = require('../src/modules/workers/workers.router') as typeof import('../src/modules/workers/workers.router');

const workerId = '10000000-0000-4000-8000-000000000001';
const workerUserId = '20000000-0000-4000-8000-000000000001';
const ownedHealthKey =
  `workers/${workerId}/documents/health_certificate/health-certificate.pdf`;
const foreignCriminalKey =
  'workers/99999999-0000-4000-8000-000000000999/documents/criminal_record/foreign.pdf';

type AsyncMethod = (...args: any[]) => Promise<any>;

async function withPrismaMethod<T>(
  method: string,
  replacement: AsyncMethod,
  operation: () => Promise<T>,
): Promise<T> {
  const target = prisma as unknown as Record<string, unknown>;
  const original = target[method];
  target[method] = replacement;
  try {
    return await operation();
  } finally {
    target[method] = original;
  }
}

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

function readyDocument(
  type: 'health_certificate' | 'criminal_record',
  key: string,
  companyVisible: boolean,
) {
  return {
    type,
    name: `${type}.pdf`,
    key,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    uploaded_at: '2026-07-16T00:00:00.000Z',
    company_visible: companyVisible,
    status: 'ready',
    scan_status: 'clean',
    scanner: 'regression',
    scanned_at: '2026-07-16T00:00:00.000Z',
    content_sha256: 'a'.repeat(64),
  };
}

async function testDocumentOwnerDeletionTransaction(): Promise<void> {
  deletedObjects.length = 0;
  const criminal = readyDocument('criminal_record', foreignCriminalKey, false);
  let workerUpdate: any;
  let auditEvent: any;
  let cleanupEvents: any[] = [];

  const tx = {
    $queryRaw: async () => [],
    worker: {
      findFirst: async (query: any) => {
        assert.deepEqual(query.where, { user_id: workerUserId, deleted_at: null });
        return { id: workerId };
      },
      findUniqueOrThrow: async () => ({
        id: workerId,
        documents: [
          readyDocument('health_certificate', ownedHealthKey, true),
          criminal,
        ],
      }),
      update: async (query: any) => {
        workerUpdate = query;
        return { id: workerId };
      },
    },
    auditLog: {
      create: async (query: any) => {
        auditEvent = query.data;
        return { id: 'audit-document-delete' };
      },
    },
    outboxEvent: {
      createMany: async (query: any) => {
        cleanupEvents = query.data;
        return { count: query.data.length };
      },
    },
  };

  const response = await withPrismaMethod(
    '$transaction',
    async (callback: (client: any) => Promise<any>) => callback(tx),
    () => WorkersService.deleteMyDocument(workerUserId, 'health_certificate'),
  );

  assert.equal(response.status, 'deleted');
  assert.equal(response.worker_id, workerId);
  assert.equal(response.document_type, 'health_certificate');
  assert.match(response.deleted_at, /^\d{4}-\d{2}-\d{2}T/);

  const nextDocuments = workerUpdate.data.documents as any[];
  const health = nextDocuments.find((item) => item.type === 'health_certificate');
  const retainedCriminal = nextDocuments.find((item) => item.type === 'criminal_record');
  assert.deepEqual(
    Object.keys(health).sort(),
    ['company_visible', 'deleted_at', 'status', 'type'].sort(),
  );
  assert.equal(health.status, 'deleted');
  assert.equal(health.company_visible, false);
  assert.equal(retainedCriminal.key, foreignCriminalKey);

  assert.equal(auditEvent.actor_id, workerUserId);
  assert.equal(auditEvent.actor_role, 'worker');
  assert.equal(auditEvent.entity_type, 'worker_document');
  assert.equal(auditEvent.entity_id, workerId);
  assert.equal(auditEvent.metadata.event, 'document_deleted_by_owner');
  assert.equal(auditEvent.metadata.storage_cleanup_scheduled, true);
  assert.equal(auditEvent.metadata.storage_cleanup_event_count, 1);
  assert.equal(JSON.stringify(auditEvent).includes(ownedHealthKey), false);
  assert.equal(auditEvent.metadata.object_key_hash.length, 64);
  assert.deepEqual(cleanupEvents, [{
    aggregate: 'worker_document',
    aggregate_id: workerId,
    event_type: 'privacy.storage.delete',
    payload: {
      key: ownedHealthKey,
      visibility: 'private',
      reason: 'worker_document_owner_deletion',
    },
  }]);
  assert.deepEqual(deletedObjects, [], 'privacy deletion must not call storage after commit');
}

async function testForeignDocumentKeyIsNeverDeleted(): Promise<void> {
  deletedObjects.length = 0;
  let auditEvent: any;
  const tx = {
    $queryRaw: async () => [],
    worker: {
      findFirst: async () => ({ id: workerId }),
      findUniqueOrThrow: async () => ({
        id: workerId,
        documents: [readyDocument('criminal_record', foreignCriminalKey, false)],
      }),
      update: async () => ({ id: workerId }),
    },
    auditLog: {
      create: async (query: any) => {
        auditEvent = query.data;
        return { id: 'audit-foreign-document-delete' };
      },
    },
  };

  await withPrismaMethod(
    '$transaction',
    async (callback: (client: any) => Promise<any>) => callback(tx),
    () => WorkersService.deleteMyDocument(workerUserId, 'criminal_record'),
  );

  assert.equal(auditEvent.metadata.storage_cleanup_scheduled, false);
  assert.deepEqual(deletedObjects, []);
}

async function testMissingDocumentDoesNotMutate(): Promise<void> {
  let mutationAttempted = false;
  const tx = {
    $queryRaw: async () => [],
    worker: {
      findFirst: async () => ({ id: workerId }),
      findUniqueOrThrow: async () => ({
        id: workerId,
        documents: [readyDocument('criminal_record', foreignCriminalKey, false)],
      }),
      update: async () => {
        mutationAttempted = true;
      },
    },
    auditLog: {
      create: async () => {
        mutationAttempted = true;
      },
    },
  };

  await withPrismaMethod(
    '$transaction',
    async (callback: (client: any) => Promise<any>) => callback(tx),
    () => expectAppError(
      () => WorkersService.deleteMyDocument(workerUserId, 'health_certificate'),
      404,
      'WORKER_DOCUMENT_NOT_FOUND',
    ),
  );
  assert.equal(mutationAttempted, false);
}

async function testAccountDeletionSoftDeletesAndAudits(): Promise<void> {
  deletedObjects.length = 0;
  const legacyPublicUrl =
    `/uploads/workers/${workerId}/legacy/health-certificate.pdf`;
  const profilePhotoUrl =
    `/uploads/workers/${workerId}/profile-photo/avatar.webp`;
  let workerUpdate: any;
  let userUpdate: any;
  let refreshTokenUpdate: any;
  let deviceTokenUpdate: any;
  let auditEvent: any;
  let cleanupEvents: any[] = [];

  const tx = {
    $queryRaw: async () => [],
    worker: {
      findFirst: async (query: any) => {
        assert.deepEqual(query.where, { user_id: workerUserId, deleted_at: null });
        return { id: workerId };
      },
      findUniqueOrThrow: async () => ({
        id: workerId,
        user_id: workerUserId,
        status: 'approved',
        documents: [
          readyDocument('health_certificate', ownedHealthKey, true),
          readyDocument('criminal_record', foreignCriminalKey, false),
          {
            type: 'health_certificate_legacy',
            name: 'legacy.pdf',
            url: legacyPublicUrl,
            company_visible: false,
          },
        ],
        profile_photo_url: profilePhotoUrl,
      }),
      update: async (query: any) => {
        workerUpdate = query;
        return { id: workerId };
      },
    },
    user: {
      update: async (query: any) => {
        userUpdate = query;
        return { id: workerUserId };
      },
    },
    refreshToken: {
      updateMany: async (query: any) => {
        refreshTokenUpdate = query;
        return { count: 2 };
      },
    },
    deviceToken: {
      updateMany: async (query: any) => {
        deviceTokenUpdate = query;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (query: any) => {
        auditEvent = query.data;
        return { id: 'audit-account-delete' };
      },
    },
    outboxEvent: {
      createMany: async (query: any) => {
        cleanupEvents = query.data;
        return { count: query.data.length };
      },
    },
  };

  const response = await withPrismaMethod(
    '$transaction',
    async (callback: (client: any) => Promise<any>) => callback(tx),
    () => WorkersService.requestMyAccountDeletion(workerUserId),
  );

  assert.deepEqual(
    {
      request_id: response.request_id,
      worker_id: response.worker_id,
      status: response.status,
      account_state: response.account_state,
    },
    {
      request_id: 'audit-account-delete',
      worker_id: workerId,
      status: 'accepted',
      account_state: 'inactive',
    },
  );
  assert.match(response.effective_at, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(workerUpdate.where.id, workerId);
  assert.equal(workerUpdate.data.status, 'inactive');
  assert.equal(workerUpdate.data.availability, false);
  assert.ok(workerUpdate.data.deleted_at instanceof Date);
  assert.equal(workerUpdate.data.profile_photo_url, null);
  assert.deepEqual(workerUpdate.data.skills, []);
  assert.deepEqual(workerUpdate.data.languages, []);
  assert.deepEqual(workerUpdate.data.work_history, []);
  for (const document of workerUpdate.data.documents as any[]) {
    assert.equal(document.status, 'deleted');
    assert.equal(document.company_visible, false);
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'key'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'url'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(document, 'name'), false);
  }

  assert.equal(userUpdate.where.id, workerUserId);
  assert.equal(userUpdate.data.is_active, false);
  assert.ok(userUpdate.data.deleted_at instanceof Date);
  assert.equal(userUpdate.data.email, null);
  assert.equal(userUpdate.data.password_hash, null);
  assert.equal(userUpdate.data.name, 'Deleted Worker');
  assert.equal(userUpdate.data.phone.includes(workerId), true);
  assert.deepEqual(userUpdate.data.session_version, { increment: 1 });

  assert.deepEqual(refreshTokenUpdate.where, {
    user_id: workerUserId,
    revoked_at: null,
  });
  assert.equal(refreshTokenUpdate.data.revoked_reason, 'account_deletion');
  assert.deepEqual(deviceTokenUpdate.where, {
    user_id: workerUserId,
    revoked_at: null,
  });
  assert.ok(deviceTokenUpdate.data.deleted_at instanceof Date);

  assert.equal(auditEvent.actor_id, workerUserId);
  assert.equal(auditEvent.actor_role, 'worker');
  assert.equal(auditEvent.entity_type, 'worker_account_deletion_request');
  assert.equal(auditEvent.entity_id, workerId);
  assert.equal(auditEvent.metadata.event, 'account_deletion_requested');
  assert.equal(auditEvent.metadata.fulfillment, 'soft_deleted_and_anonymized');
  assert.equal(auditEvent.metadata.sessions_revoked, true);
  assert.equal(auditEvent.metadata.storage_cleanup_scheduled, true);
  assert.equal(auditEvent.metadata.storage_cleanup_event_count, 3);
  assert.equal(JSON.stringify(auditEvent).includes('+994'), false);
  assert.equal(JSON.stringify(auditEvent).includes(ownedHealthKey), false);

  assert.deepEqual(
    cleanupEvents
      .map((event) => ({
        key: event.payload.key,
        visibility: event.payload.visibility,
        reason: event.payload.reason,
        event_type: event.event_type,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    [
      {
        key: ownedHealthKey,
        visibility: 'private',
        reason: 'worker_account_deletion',
        event_type: 'privacy.storage.delete',
      },
      {
        key: `workers/${workerId}/legacy/health-certificate.pdf`,
        visibility: 'public',
        reason: 'worker_account_deletion',
        event_type: 'privacy.storage.delete',
      },
      {
        key: `workers/${workerId}/profile-photo/avatar.webp`,
        visibility: 'public',
        reason: 'worker_account_deletion',
        event_type: 'privacy.storage.delete',
      },
    ].sort((left, right) => left.key.localeCompare(right.key)),
  );
  assert.equal(cleanupEvents.some((event) => event.payload.key === foreignCriminalKey), false);
  assert.deepEqual(deletedObjects, [], 'account deletion must rely on the durable outbox');
}

async function testStorageCleanupOutboxDelivery(): Promise<void> {
  const delivered: Array<{ key: string; visibility: 'public' | 'private' }> = [];
  await deliverStorageCleanupOutboxEvent(
    { key: ownedHealthKey, visibility: 'private', reason: 'worker_account_deletion' },
    async (key, visibility) => {
      delivered.push({ key, visibility });
    },
  );
  assert.deepEqual(delivered, [{ key: ownedHealthKey, visibility: 'private' }]);

  await assert.rejects(
    deliverStorageCleanupOutboxEvent(
      { key: ownedHealthKey, visibility: 'internal' },
      async () => undefined,
    ),
    /invalid visibility/,
  );
  await assert.rejects(
    deliverStorageCleanupOutboxEvent(
      { key: '', visibility: 'private' },
      async () => undefined,
    ),
    /invalid object key/,
  );
}

function testRouteIsolationAndStrictConfirmation(): void {
  assert.equal(WorkerAccountDeletionRequestSchema.safeParse({ confirm: true }).success, true);
  assert.equal(WorkerAccountDeletionRequestSchema.safeParse({ confirm: false }).success, false);
  assert.equal(WorkerAccountDeletionRequestSchema.safeParse({}).success, false);
  assert.equal(
    WorkerAccountDeletionRequestSchema.safeParse({ confirm: true, worker_id: workerId }).success,
    false,
  );

  const routerSource = fs.readFileSync(
    path.resolve('src/modules/workers/workers.router.ts'),
    'utf8',
  );
  assert.match(
    routerSource,
    /router\.delete\('\/workers\/me\/documents\/:type', requireEnrollmentAuth, requireRole\('worker'\),/,
  );
  assert.match(
    routerSource,
    /router\.post\('\/workers\/me\/account-deletion-request', requireAuth, requireRole\('worker'\),/,
  );
  assert.equal(
    /router\.(?:post|delete)\('\/(?:admin|company)\/[^']+'[\s\S]*?(?:deleteMyDocument|requestMyAccountDeletion)/.test(routerSource),
    false,
  );

  const serviceSource = fs.readFileSync(
    path.resolve('src/modules/workers/workers.service.ts'),
    'utf8',
  );
  assert.equal(/\btx\.(?:worker|user)\.delete(?:Many)?\s*\(/.test(serviceSource), false);
  assert.equal(
    /\bauditLog\.(?:update|updateMany|delete|deleteMany|upsert)\s*\(/.test(serviceSource),
    false,
  );
  assert.equal(/result\.cleanups/.test(serviceSource), false);

  const outboxSource = fs.readFileSync(path.resolve('src/lib/outbox.ts'), 'utf8');
  assert.match(outboxSource, /eventType === 'privacy\.storage\.delete'/);

  const swagger = fs.readFileSync(path.resolve('swagger.yaml'), 'utf8');
  assert.ok(swagger.includes('/workers/me/documents/{type}:'));
  assert.ok(swagger.includes('/workers/me/account-deletion-request:'));
  assert.ok(swagger.includes('no database row is hard-deleted'));
}

async function main(): Promise<void> {
  try {
    await testDocumentOwnerDeletionTransaction();
    await testForeignDocumentKeyIsNeverDeleted();
    await testMissingDocumentDoesNotMutate();
    await testAccountDeletionSoftDeletesAndAudits();
    await testStorageCleanupOutboxDelivery();
    testRouteIsolationAndStrictConfirmation();
    console.log('privacy-deletion-regression: OK');
  } finally {
    (uploads as any).createUploadService = originalCreateUploadService;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
