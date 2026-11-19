import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { inspectUpload, scanUpload } from '../src/lib/file-security';
import { createUploadService } from '../src/lib/uploads';

type JsonDocument = Record<string, unknown>;

type ScriptOptions = {
  execute: boolean;
  cleanupOrphans: boolean;
  olderThanHours: number;
};

type StoredObject = {
  key: string;
  body: Buffer;
  contentType?: string;
};

type ListedObject = {
  key: string;
  modifiedAt: Date;
};

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function parseOptions(argv: string[]): ScriptOptions {
  const execute = argv.includes('--execute');
  const cleanupOrphans = argv.includes('--cleanup-orphans');
  const ageArgument = argv.find((argument) => argument.startsWith('--older-than-hours='));
  const olderThanHours = ageArgument ? Number(ageArgument.split('=', 2)[1]) : 168;
  if (!Number.isFinite(olderThanHours) || !Number.isInteger(olderThanHours) || olderThanHours < 1) {
    throw new Error('--older-than-hours must be a positive integer.');
  }
  if (cleanupOrphans && !execute) {
    throw new Error('--cleanup-orphans requires --execute.');
  }
  return { execute, cleanupOrphans, olderThanHours };
}

export function assertBackfillExecutionAllowed(options: ScriptOptions): void {
  if (!options.execute) return;
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PRIVATE_DOCUMENT_BACKFILL !== 'true'
  ) {
    throw new Error(
      'Production execution is blocked. Set ALLOW_PRIVATE_DOCUMENT_BACKFILL=true for the one-off maintenance job.',
    );
  }
}

export function extractPublicObjectKey(
  value: string,
  configuredBase = process.env.STORAGE_PUBLIC_BASE_URL ?? '/uploads',
): string | null {
  const input = value.trim();
  const base = configuredBase.trim().replace(/\/+$/, '');
  if (!input || !base) return null;

  try {
    if (base.startsWith('/')) {
      const pathname = input.startsWith('http://') || input.startsWith('https://')
        ? new URL(input).pathname
        : input.split(/[?#]/, 1)[0];
      const prefix = `${base}/`;
      if (!pathname.startsWith(prefix)) return null;
      return normalizeStorageKey(decodeURIComponent(pathname.slice(prefix.length)));
    }

    const baseUrl = new URL(`${base}/`);
    const inputUrl = new URL(input, baseUrl);
    if (inputUrl.origin !== baseUrl.origin || !inputUrl.pathname.startsWith(baseUrl.pathname)) {
      return null;
    }
    return normalizeStorageKey(
      decodeURIComponent(inputUrl.pathname.slice(baseUrl.pathname.length)),
    );
  } catch {
    return null;
  }
}

export function isReadyPrivateDocument(
  document: JsonDocument,
  workerId: string,
): boolean {
  const type = stringValue(document.type);
  const key = stringValue(document.key);
  return Boolean(
    type &&
    key &&
    key.startsWith(`workers/${workerId}/documents/${type}/`) &&
    document.status === 'ready' &&
    document.scan_status === 'clean',
  );
}

export function documentRequiresBackfill(
  document: JsonDocument,
  workerId: string,
): boolean {
  return Boolean(stringValue(document.url)) && !isReadyPrivateDocument(document, workerId);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  assertBackfillExecutionAllowed(options);

  const workers = await prisma.worker.findMany({
    where: { deleted_at: null },
    select: { id: true, documents: true },
    orderBy: { id: 'asc' },
  });

  const counters = {
    workers_scanned: workers.length,
    documents_scanned: 0,
    migration_candidates: 0,
    migrated: 0,
    cleanup_only: 0,
    public_objects_deleted: 0,
    unresolved_public_urls: 0,
    failures: 0,
    orphan_candidates: 0,
    orphans_deleted: 0,
  };

  for (const worker of workers) {
    const documents = normalizeDocuments(worker.documents);
    counters.documents_scanned += documents.length;

    for (const document of documents) {
      const type = stringValue(document.type);
      if (!type) continue;

      const pendingPublicKey = stringValue(document.legacy_public_cleanup_pending_key);
      if (pendingPublicKey) {
        if (!options.execute) {
          log('pending_public_cleanup', { worker_id: worker.id, document_type: type });
          continue;
        }
        try {
          await deleteStoredObject(pendingPublicKey, 'public');
          await clearPendingPublicCleanup(worker.id, type, pendingPublicKey);
          counters.public_objects_deleted += 1;
        } catch (error) {
          counters.failures += 1;
          log('pending_public_cleanup_failed', {
            worker_id: worker.id,
            document_type: type,
            reason: safeFailure(error),
          });
        }
        continue;
      }

      const publicUrl = stringValue(document.url);
      if (!publicUrl) continue;
      const sourceKey = extractPublicObjectKey(publicUrl);
      if (!sourceKey) {
        counters.unresolved_public_urls += 1;
        log('unresolved_public_url', { worker_id: worker.id, document_type: type });
        continue;
      }

      const cleanupOnly = isReadyPrivateDocument(document, worker.id);
      if (cleanupOnly) counters.cleanup_only += 1;
      else counters.migration_candidates += 1;

      if (!options.execute) {
        log(cleanupOnly ? 'cleanup_only_candidate' : 'migration_candidate', {
          worker_id: worker.id,
          document_type: type,
          source_key_hash: hash(sourceKey),
        });
        continue;
      }

      try {
        let replacement = document;
        let newPrivateKey: string | undefined;
        if (!cleanupOnly) {
          const migrated = await migrateObject(worker.id, type, sourceKey, document);
          replacement = migrated.document;
          newPrivateKey = migrated.privateKey;
        }

        try {
          await markDocumentPendingPublicCleanup(
            worker.id,
            type,
            publicUrl,
            sourceKey,
            replacement,
          );
        } catch (error) {
          if (newPrivateKey) await deleteObjectBestEffort(newPrivateKey, 'private');
          throw error;
        }

        await deleteStoredObject(sourceKey, 'public');
        counters.public_objects_deleted += 1;
        await clearPendingPublicCleanup(worker.id, type, sourceKey);
        if (!cleanupOnly) counters.migrated += 1;
      } catch (error) {
        counters.failures += 1;
        log('migration_failed', {
          worker_id: worker.id,
          document_type: type,
          reason: safeFailure(error),
        });
      }
    }
  }

  const referencedPrivateKeys = await loadReferencedPrivateKeys();
  const cutoff = Date.now() - options.olderThanHours * 60 * 60 * 1000;
  const storedPrivateObjects = await listStoredObjects('workers/', 'private');
  const orphanCandidates = storedPrivateObjects.filter((object) =>
    object.modifiedAt.getTime() <= cutoff &&
    (
      object.key.includes('/quarantine/') ||
      (
        object.key.includes('/documents/') &&
        !referencedPrivateKeys.has(object.key)
      )
    ),
  );
  counters.orphan_candidates = orphanCandidates.length;

  for (const object of orphanCandidates) {
    log('orphan_candidate', {
      object_key_hash: hash(object.key),
      modified_at: object.modifiedAt.toISOString(),
    });
    if (options.cleanupOrphans) {
      try {
        await deleteStoredObject(object.key, 'private');
        counters.orphans_deleted += 1;
      } catch (error) {
        counters.failures += 1;
        log('orphan_cleanup_failed', {
          object_key_hash: hash(object.key),
          reason: safeFailure(error),
        });
      }
    }
  }

  log('private_document_backfill_summary', {
    mode: options.execute ? 'execute' : 'dry-run',
    cleanup_orphans: options.cleanupOrphans,
    older_than_hours: options.olderThanHours,
    ...counters,
  });

  if (counters.failures > 0 || counters.unresolved_public_urls > 0) {
    process.exitCode = 2;
  }
}

async function migrateObject(
  workerId: string,
  type: string,
  sourceKey: string,
  document: JsonDocument,
): Promise<{ document: JsonDocument; privateKey: string }> {
  const stored = await readStoredObject(sourceKey, 'public');
  const originalName = stringValue(document.name) ?? path.posix.basename(sourceKey);
  const declaredMime = supportedMime(
    stringValue(document.mime_type) ??
    stored.contentType ??
    mimeFromExtension(originalName),
  );
  if (!declaredMime) {
    throw new Error('unsupported_legacy_mime');
  }

  const file = multerFile(originalName, declaredMime, stored.body);
  const inspection = await inspectUpload(file, SUPPORTED_MIME_TYPES);
  const quarantineKey = `workers/${workerId}/quarantine/${crypto.randomUUID()}${inspection.extension}`;
  const finalKey = `workers/${workerId}/documents/${type}/${crypto.randomUUID()}${inspection.extension}`;
  const uploadService = createUploadService();
  await uploadService.putPrivateObject({
    key: quarantineKey,
    contentType: inspection.detectedMimeType,
    body: stored.body,
    downloadName: inspection.safeOriginalName,
  });

  try {
    const scan = await scanUpload(stored.body, inspection, { sensitive: true });
    await uploadService.promotePrivateObject(quarantineKey, finalKey);
    const {
      url: _legacyUrl,
      legacy_public_cleanup_pending_key: _pendingKey,
      ...existing
    } = document;
    return {
      privateKey: finalKey,
      document: {
        ...existing,
        type,
        name: inspection.safeOriginalName,
        key: finalKey,
        mime_type: inspection.detectedMimeType,
        size_bytes: inspection.sizeBytes,
        uploaded_at: stringValue(document.uploaded_at) ?? new Date().toISOString(),
        status: 'ready',
        scan_status: scan.status,
        scanner: scan.scanner,
        scanned_at: scan.scannedAt,
        content_sha256: inspection.sha256,
      },
    };
  } catch (error) {
    await deleteObjectBestEffort(quarantineKey, 'private');
    await deleteObjectBestEffort(finalKey, 'private');
    throw error;
  }
}

async function markDocumentPendingPublicCleanup(
  workerId: string,
  type: string,
  legacyUrl: string,
  sourceKey: string,
  replacement: JsonDocument,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM workers WHERE id = ${workerId} FOR UPDATE`;
    const current = await tx.worker.findUniqueOrThrow({
      where: { id: workerId },
      select: { documents: true },
    });
    const documents = normalizeDocuments(current.documents);
    const index = documents.findIndex((document) =>
      document.type === type &&
      (
        document.url === legacyUrl ||
        document.legacy_public_cleanup_pending_key === sourceKey
      ),
    );
    if (index < 0) throw new Error('document_changed_during_backfill');

    const { url: _legacyUrl, ...safeReplacement } = replacement;
    documents[index] = {
      ...safeReplacement,
      legacy_public_cleanup_pending_key: sourceKey,
    };
    await tx.worker.update({
      where: { id: workerId },
      data: { documents: documents as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        actor_id: null,
        actor_role: 'super_admin',
        action: 'status_changed',
        entity_type: 'worker_document',
        entity_id: workerId,
        metadata: {
          event: 'legacy_public_document_backfilled',
          document_type: type,
          source_key_hash: hash(sourceKey),
          target_key_hash: hash(stringValue(safeReplacement.key) ?? ''),
        },
      },
    });
  });
}

async function clearPendingPublicCleanup(
  workerId: string,
  type: string,
  sourceKey: string,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM workers WHERE id = ${workerId} FOR UPDATE`;
    const current = await tx.worker.findUniqueOrThrow({
      where: { id: workerId },
      select: { documents: true },
    });
    const documents = normalizeDocuments(current.documents);
    const index = documents.findIndex((document) =>
      document.type === type &&
      document.legacy_public_cleanup_pending_key === sourceKey,
    );
    if (index < 0) return;
    const {
      legacy_public_cleanup_pending_key: _pendingKey,
      ...cleanDocument
    } = documents[index];
    documents[index] = cleanDocument;
    await tx.worker.update({
      where: { id: workerId },
      data: { documents: documents as Prisma.InputJsonValue },
    });
  });
}

async function loadReferencedPrivateKeys(): Promise<Set<string>> {
  const workers = await prisma.worker.findMany({
    where: { deleted_at: null },
    select: { documents: true },
  });
  return new Set(
    workers.flatMap((worker: { documents: unknown }) =>
      normalizeDocuments(worker.documents)
        .map((document) => stringValue(document.key))
        .filter((key): key is string => Boolean(key)),
    ),
  );
}

function normalizeDocuments(value: unknown): JsonDocument[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonDocument => Boolean(item && typeof item === 'object'))
    : [];
}

function multerFile(
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

async function readStoredObject(
  key: string,
  visibility: 'public' | 'private',
): Promise<StoredObject> {
  const safeKey = normalizeStorageKey(key);
  if (storageProvider() === 'local') {
    const filePath = resolveLocalObjectPath(safeKey, visibility);
    return { key: safeKey, body: await fs.readFile(filePath) };
  }

  const result = await objectStorageClient().send(new GetObjectCommand({
    Bucket: requiredEnv('S3_BUCKET'),
    Key: safeKey,
  }));
  if (!result.Body) throw new Error('source_object_body_missing');
  return {
    key: safeKey,
    body: Buffer.from(await result.Body.transformToByteArray()),
    contentType: result.ContentType,
  };
}

async function listStoredObjects(
  prefix: string,
  visibility: 'public' | 'private',
): Promise<ListedObject[]> {
  if (storageProvider() === 'local') {
    const root = localStorageRoot(visibility);
    return listLocalObjects(root, prefix);
  }

  const client = objectStorageClient();
  const bucket = requiredEnv('S3_BUCKET');
  const objects: ListedObject[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizeStorageKey(prefix),
      ContinuationToken: continuationToken,
    }));
    for (const item of result.Contents ?? []) {
      if (item.Key && item.LastModified) {
        objects.push({ key: item.Key, modifiedAt: item.LastModified });
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function listLocalObjects(root: string, prefix: string): Promise<ListedObject[]> {
  const start = resolveWithinRoot(root, normalizeStorageKey(prefix));
  const objects: ListedObject[] = [];

  async function walk(directory: string): Promise<void> {
    let entries: Array<import('fs').Dirent>;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const stat = await fs.stat(absolute);
        objects.push({
          key: path.relative(root, absolute).split(path.sep).join('/'),
          modifiedAt: stat.mtime,
        });
      }
    }
  }

  await walk(start);
  return objects;
}

async function deleteStoredObject(
  key: string,
  visibility: 'public' | 'private',
): Promise<void> {
  const safeKey = normalizeStorageKey(key);
  if (storageProvider() === 'local') {
    await fs.rm(resolveLocalObjectPath(safeKey, visibility), { force: true });
    return;
  }
  await objectStorageClient().send(new DeleteObjectCommand({
    Bucket: requiredEnv('S3_BUCKET'),
    Key: safeKey,
  }));
}

async function deleteObjectBestEffort(
  key: string,
  visibility: 'public' | 'private',
): Promise<void> {
  try {
    await deleteStoredObject(key, visibility);
  } catch {
    // The dry-run/orphan reconciliation pass reports any surviving object later.
  }
}

function storageProvider(): 'local' | 's3' | 'r2' {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local' || provider === 's3' || provider === 'r2') return provider;
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

let cachedObjectStorageClient: S3Client | undefined;
function objectStorageClient(): S3Client {
  if (cachedObjectStorageClient) return cachedObjectStorageClient;
  const provider = storageProvider();
  if (provider === 'local') throw new Error('Object storage is not configured.');
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  cachedObjectStorageClient = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint,
    forcePathStyle: provider === 'r2' || Boolean(endpoint),
    credentials: {
      accessKeyId: requiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
  return cachedObjectStorageClient;
}

function localStorageRoot(visibility: 'public' | 'private'): string {
  return path.resolve(
    visibility === 'private'
      ? process.env.LOCAL_PRIVATE_UPLOAD_DIR ?? 'private-uploads'
      : process.env.LOCAL_UPLOAD_DIR ?? 'uploads',
  );
}

function resolveLocalObjectPath(key: string, visibility: 'public' | 'private'): string {
  return resolveWithinRoot(localStorageRoot(visibility), key);
}

function resolveWithinRoot(root: string, key: string): string {
  const target = path.resolve(root, normalizeStorageKey(key));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('unsafe_object_key');
  }
  return target;
}

function normalizeStorageKey(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (
    !parts.length ||
    parts.some((part) =>
      part === '.' ||
      part === '..' ||
      /[\x00-\x1f\x7f<>:"|?*]/.test(part)
    )
  ) {
    throw new Error('unsafe_object_key');
  }
  return parts.join('/');
}

function supportedMime(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  return SUPPORTED_MIME_TYPES.has(normalized) ? normalized : null;
}

function mimeFromExtension(name: string): string | undefined {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.pdf') return 'application/pdf';
  return undefined;
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key}_missing`);
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeFailure(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_.-]+$/i.test(error.message)) return error.message;
  return 'operation_failed';
}

function log(event: string, metadata: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...metadata,
  }));
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'private_document_backfill_fatal',
        reason: safeFailure(error),
      }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
