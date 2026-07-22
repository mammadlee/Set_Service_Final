import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPushToDeviceTargets, sendPushToUser } from '../../lib/fcm';
import {
  createUploadService,
  PrivateUploadObjectResult,
  UploadObjectResult,
} from '../../lib/uploads';
import {
  inspectUpload,
  InspectedUpload,
  MalwareScanResult,
  sanitizePublicImageUpload,
  scanUpload,
} from '../../lib/file-security';
import { logger } from '../../lib/logger';
import { normalizeEmail } from '../../lib/password';
import { Role, WorkerClass, WorkerStatus } from '../../types/prisma';
import * as TaxonomyService from '../taxonomy/taxonomy.service';
import { startEmailVerification } from '../auth/auth.service';
import { enqueueStorageCleanupEvents } from '../../lib/storage-cleanup-outbox';

const WORKER_STATUSES = new Set<string>([
  'draft',
  'pending_otp',
  'pending_approval',
  'approved',
  'rejected',
  'suspended',
  'inactive',
]);

const WORKER_CLASSES = new Set<string>(['A', 'B', 'C']);
const FOC_TRAINING_FILTERS = new Set<string>(['foc', 'non_foc']);

type WorkerProfileRecord = Prisma.WorkerGetPayload<{
  include: typeof workerProfileInclude;
}>;

const workerProfileInclude = {
  user: { select: { name: true, phone: true, email: true, email_verified_at: true, pending_email: true } },
  positions: {
    include: {
      position: {
        include: {
          subdepartment: {
            include: {
              department: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkerInclude;

export async function getMyWorker(userId: string) {
  const worker = await prisma.worker.findUnique({
    where: { user_id: userId },
    include: workerProfileInclude,
  });
  if (!worker || worker.deleted_at) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before using worker APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }
  return toWorkerProfile(worker);
}

export async function updateMyWorker(
  userId: string,
  data: {
    skills?: unknown;
    languages?: unknown;
    availability?: boolean;
    work_history_summary?: string | null;
    work_history?: unknown;
    gender?: string | null;
    whatsapp_available?: boolean;
    email?: string | null;
    position_ids?: string[];
  }
) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker || worker.deleted_at) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before using worker APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }

  const { email, position_ids } = data;
  const workerData: Prisma.WorkerUpdateInput = {};
  if (data.skills !== undefined) workerData.skills = data.skills as Prisma.InputJsonValue;
  if (data.languages !== undefined) workerData.languages = data.languages as Prisma.InputJsonValue;
  if (data.availability !== undefined) workerData.availability = data.availability;
  if (data.work_history_summary !== undefined) workerData.work_history_summary = data.work_history_summary;
  if (data.work_history !== undefined) workerData.work_history = data.work_history as Prisma.InputJsonValue;
  if (data.gender !== undefined) workerData.gender = data.gender;
  if (data.whatsapp_available !== undefined) workerData.whatsapp_available = data.whatsapp_available;
  const selectedPositions = position_ids ? await resolveWorkerPositions(position_ids) : null;
  let updated: WorkerProfileRecord;
  try {
    updated = await prisma.worker.update({
      where: { user_id: userId },
      data: {
        ...workerData,
        ...(selectedPositions
          ? {
              position: selectedPositions.map((position) => position.name_az).join(', '),
              positions: {
                deleteMany: {},
                create: selectedPositions.map((position) => ({
                  position_id: position.id,
                })),
              },
            }
          : {}),
      },
      include: workerProfileInclude,
    });
    if (email !== undefined) {
      const cleanedEmail = email === null || email.trim() === '' ? null : normalizeEmail(email);
      if (cleanedEmail === null) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            email: null,
            email_verified_at: null,
            pending_email: null,
            email_verification_code_hash: null,
            email_verification_expires_at: null,
            email_verification_sent_at: null,
            email_verification_attempts: 0,
            email_verification_blocked_until: null,
          },
        });
      } else if (cleanedEmail === updated.user.pending_email) {
        // Pending email is already awaiting verification.
      } else if (cleanedEmail !== updated.user.email || !updated.user.email_verified_at) {
        await startEmailVerification(userId, cleanedEmail);
      }
      updated = await prisma.worker.findUniqueOrThrow({
        where: { user_id: userId },
        include: workerProfileInclude,
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw Errors.conflict('This email is already registered.', 'EMAIL_ALREADY_REGISTERED');
    }
    throw error;
  }
  return toWorkerProfile(updated);
}

export async function uploadMyProfilePhoto(userId: string, file: Express.Multer.File | undefined) {
  const worker = await getDocumentEnrollmentWorkerRecord(userId);
  const upload = await putWorkerUpload({
    workerId: worker.id,
    file,
    folder: 'profile-photo',
    allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
    visibility: 'public',
  });

  let updated: WorkerProfileRecord;
  try {
    updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedWorker = await tx.worker.update({
        where: { id: worker.id },
        data: { profile_photo_url: upload.url },
        include: workerProfileInclude,
      });
      await tx.auditLog.create({
        data: {
          actor_id: userId,
          actor_role: 'worker' as Role,
          action: 'status_changed',
          entity_type: 'worker_profile_photo',
          entity_id: worker.id,
          metadata: {
            event: 'profile_photo_replaced',
            content_sha256: upload.inspection.sha256,
            scanner: upload.scan.scanner,
          },
        },
      });
      return updatedWorker;
    });
  } catch (error) {
    await deleteObjectBestEffort(upload.key, 'public', 'new_profile_photo_rollback');
    throw error;
  }

  const previousKey = publicObjectKeyFromUrl(worker.profile_photo_url);
  if (previousKey && previousKey !== upload.key) {
    await deleteObjectBestEffort(previousKey, 'public', 'replaced_profile_photo_cleanup');
  }

  return toWorkerProfile(updated);
}

export async function updateWorkerClass(
  id: string,
  workerClass: WorkerClass | null,
  actor: { sub: string; role: string }
) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: workerProfileInclude,
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');

  if (workerClass !== null && !WORKER_CLASSES.has(workerClass)) {
    throw Errors.badRequest('Invalid worker class.', 'INVALID_WORKER_CLASS');
  }
  if (worker.worker_class === workerClass) {
    return toWorkerProfile(worker, { includeWorkerClass: true });
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedWorker = await tx.worker.update({
      where: { id },
      data: { worker_class: workerClass },
      include: workerProfileInclude,
    });

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role as Role,
        action: 'worker_class_updated',
        entity_type: 'worker',
        entity_id: id,
        metadata: {
          previous_worker_class: worker.worker_class,
          new_worker_class: workerClass,
        },
      },
    });

    return updatedWorker;
  });

  return toWorkerProfile(updated, { includeWorkerClass: true });
}

export async function updateWorkersFocTraining(
  workerIds: string[],
  isFocTraining: boolean,
  note: string | null | undefined,
  actor: { sub: string; role: string }
) {
  const uniqueWorkerIds = [...new Set(workerIds)];
  const workers: WorkerProfileRecord[] = await prisma.worker.findMany({
    where: { id: { in: uniqueWorkerIds }, deleted_at: null },
    include: workerProfileInclude,
  });

  const foundWorkerIds = new Set(workers.map((worker) => worker.id));
  const missingWorkerIds = uniqueWorkerIds.filter((id) => !foundWorkerIds.has(id));
  if (missingWorkerIds.length > 0) {
    throw Errors.notFound('One or more workers were not found.', 'WORKERS_NOT_FOUND', {
      worker_ids: missingWorkerIds,
    });
  }

  const now = new Date();
  const noteWasProvided = note !== undefined;
  const cleanedNote = typeof note === 'string' ? note.trim() || null : null;
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedWorkers: WorkerProfileRecord[] = [];

    for (const worker of workers) {
      const newNote = isFocTraining ? (noteWasProvided ? cleanedNote : worker.foc_training_note) : null;
      const shouldAudit = worker.is_foc_training !== isFocTraining || worker.foc_training_note !== newNote;
      if (!shouldAudit) {
        updatedWorkers.push(worker);
        continue;
      }
      const updatedWorker = await tx.worker.update({
        where: { id: worker.id },
        data: {
          is_foc_training: isFocTraining,
          foc_training_note: newNote,
          foc_training_updated_at: now,
          foc_training_updated_by_id: actor.sub,
        },
        include: workerProfileInclude,
      });
      updatedWorkers.push(updatedWorker);

      await tx.auditLog.create({
        data: {
          actor_id: actor.sub,
          actor_role: actor.role as Role,
          action: isFocTraining ? 'worker_foc_training_added' : 'worker_foc_training_removed',
          entity_type: 'worker',
          entity_id: worker.id,
          metadata: {
            previous_is_foc_training: worker.is_foc_training,
            new_is_foc_training: isFocTraining,
            previous_note: worker.foc_training_note,
            new_note: newNote,
          },
        },
      });
    }

    return updatedWorkers;
  });

  return {
    data: updated.map((worker: WorkerProfileRecord) => toWorkerProfile(worker, { includeWorkerClass: true })),
  };
}

export async function uploadMyDocument(
  userId: string,
  type: string | undefined,
  file: Express.Multer.File | undefined
) {
  const documentType = parseWorkerDocumentType(type);
  const worker = await getApprovedWorkerRecord(userId);
  const upload = await putWorkerUpload({
    workerId: worker.id,
    file,
    folder: `documents/${documentType}`,
    allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    visibility: 'private',
  });

  const nextDocument: WorkerDocument = {
    type: documentType,
    name: upload.inspection.safeOriginalName,
    key: upload.key,
    mime_type: upload.inspection.detectedMimeType,
    size_bytes: upload.inspection.sizeBytes,
    uploaded_at: new Date().toISOString(),
    company_visible: documentType === 'health_certificate',
    status: 'ready',
    scan_status: upload.scan.status,
    scanner: upload.scan.scanner,
    scanned_at: upload.scan.scannedAt,
    content_sha256: upload.inspection.sha256,
  };

  let result: { updated: WorkerProfileRecord };
  try {
    result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM workers WHERE id = ${worker.id} FOR UPDATE`;
      const current = await tx.worker.findUniqueOrThrow({
        where: { id: worker.id },
        select: { documents: true },
      });
      const currentDocuments = normalizeDocuments(current.documents);
      const previousDocument = currentDocuments.find((document) => document.type === documentType);
      const nextDocuments = [
        ...currentDocuments.filter((document) => document.type !== documentType),
        nextDocument,
      ];
      const updatedWorker = await tx.worker.update({
        where: { id: worker.id },
        data: { documents: nextDocuments as Prisma.InputJsonValue },
        include: workerProfileInclude,
      });
      if (
        previousDocument?.key
        && previousDocument.key !== upload.key
        && privateDocumentKeyBelongsToWorker(previousDocument.key, worker.id, documentType)
      ) {
        await enqueueStorageCleanupEvents(tx, {
          aggregate: 'worker_document',
          aggregateId: worker.id,
          reason: 'worker_document_replaced',
          objects: [{ key: previousDocument.key, visibility: 'private' }],
        });
      }
      await tx.auditLog.create({
        data: {
          actor_id: userId,
          actor_role: 'worker' as Role,
          action: 'status_changed',
          entity_type: 'worker_document',
          entity_id: worker.id,
          metadata: {
            event: previousDocument ? 'document_replaced' : 'document_uploaded',
            document_type: documentType,
            previous_key_hash: previousDocument?.key ? hashObjectKey(previousDocument.key) : null,
            new_key_hash: hashObjectKey(upload.key),
            content_sha256: upload.inspection.sha256,
            scan_status: upload.scan.status,
            scanner: upload.scan.scanner,
          },
        },
      });
      return { updated: updatedWorker };
    });
  } catch (error) {
    await deletePrivateObjectBestEffort(upload.key, 'new_document_rollback');
    throw error;
  }

  return toWorkerProfile(result.updated);
}

export async function deleteMyDocument(userId: string, type: string) {
  const documentType = parseWorkerDocumentType(type);
  const now = new Date();
  const deletedAt = now.toISOString();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const worker = await tx.worker.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!worker) throw Errors.notFound('Worker document not found.', 'WORKER_DOCUMENT_NOT_FOUND');

    await tx.$queryRaw`SELECT id FROM workers WHERE id = ${worker.id} FOR UPDATE`;
    const current = await tx.worker.findUniqueOrThrow({
      where: { id: worker.id },
      select: { id: true, documents: true },
    });
    const currentDocuments = normalizeDocuments(current.documents);
    const document = currentDocuments.find((item) =>
      item.type === documentType
      && item.status !== 'deleted'
      && !item.deleted_at
    );
    if (!document) throw Errors.notFound('Worker document not found.', 'WORKER_DOCUMENT_NOT_FOUND');

    const nextDocuments = currentDocuments.map((item) =>
      item.type === documentType ? deletedDocumentTombstone(item, deletedAt) : item
    );
    const cleanup = documentStorageCleanup(document, current.id);

    await tx.worker.update({
      where: { id: current.id },
      data: { documents: nextDocuments as Prisma.InputJsonValue },
    });
    const scheduledCleanupCount = cleanup
      ? await enqueueStorageCleanupEvents(tx, {
          aggregate: 'worker_document',
          aggregateId: current.id,
          reason: 'worker_document_owner_deletion',
          objects: [cleanup],
        })
      : 0;
    await tx.auditLog.create({
      data: {
        actor_id: userId,
        actor_role: 'worker' as Role,
        action: 'status_changed',
        entity_type: 'worker_document',
        entity_id: current.id,
        metadata: {
          event: 'document_deleted_by_owner',
          document_type: documentType,
          previous_status: document.status ?? 'legacy',
          new_status: 'deleted',
          object_key_hash: document.key ? hashObjectKey(document.key) : null,
          storage_cleanup_scheduled: scheduledCleanupCount > 0,
          storage_cleanup_event_count: scheduledCleanupCount,
        },
      },
    });

    return { workerId: current.id };
  });

  return {
    status: 'deleted',
    worker_id: result.workerId,
    document_type: documentType,
    deleted_at: deletedAt,
  };
}

export async function requestMyAccountDeletion(userId: string) {
  const now = new Date();
  const effectiveAt = now.toISOString();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const worker = await tx.worker.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!worker) throw Errors.notFound('Worker account not found.', 'WORKER_NOT_FOUND');

    await tx.$queryRaw`SELECT id FROM workers WHERE id = ${worker.id} FOR UPDATE`;
    const current = await tx.worker.findUniqueOrThrow({
      where: { id: worker.id },
      select: {
        id: true,
        user_id: true,
        status: true,
        documents: true,
        profile_photo_url: true,
      },
    });
    const currentDocuments = normalizeDocuments(current.documents);
    const cleanups = currentDocuments.flatMap((document) => {
      const cleanup = documentStorageCleanup(document, current.id);
      return cleanup ? [cleanup] : [];
    });
    const profilePhotoCleanup = profilePhotoStorageCleanup(current.profile_photo_url, current.id);
    if (profilePhotoCleanup) cleanups.push(profilePhotoCleanup);
    const deletedDocuments = currentDocuments.map((document) =>
      deletedDocumentTombstone(document, effectiveAt)
    );

    await tx.worker.update({
      where: { id: current.id },
      data: {
        position: null,
        profile_photo_url: null,
        skills: [] as Prisma.InputJsonValue,
        languages: [] as Prisma.InputJsonValue,
        documents: deletedDocuments as Prisma.InputJsonValue,
        work_history_summary: null,
        work_history: [] as Prisma.InputJsonValue,
        gender: null,
        whatsapp_available: false,
        status: 'inactive' as WorkerStatus,
        reject_reason: null,
        worker_class: null,
        is_foc_training: false,
        foc_training_note: null,
        foc_training_updated_at: null,
        foc_training_updated_by_id: null,
        availability: false,
        deleted_at: now,
      },
    });
    await tx.user.update({
      where: { id: current.user_id },
      data: {
        phone: `deleted-worker:${current.id}`,
        email: null,
        email_verified_at: null,
        pending_email: null,
        email_verification_code_hash: null,
        email_verification_expires_at: null,
        email_verification_sent_at: null,
        email_verification_attempts: 0,
        email_verification_blocked_until: null,
        password_hash: null,
        password_set_at: null,
        name: 'Deleted Worker',
        fcm_token: null,
        is_active: false,
        session_version: { increment: 1 },
        deleted_at: now,
      },
    });
    await tx.refreshToken.updateMany({
      where: { user_id: current.user_id, revoked_at: null },
      data: { revoked_at: now, revoked_reason: 'account_deletion' },
    });
    await tx.deviceToken.updateMany({
      where: { user_id: current.user_id, revoked_at: null },
      data: { revoked_at: now, deleted_at: now },
    });
    const scheduledCleanupCount = await enqueueStorageCleanupEvents(tx, {
      aggregate: 'worker',
      aggregateId: current.id,
      reason: 'worker_account_deletion',
      objects: cleanups,
    });
    const audit = await tx.auditLog.create({
      data: {
        actor_id: userId,
        actor_role: 'worker' as Role,
        action: 'status_changed',
        entity_type: 'worker_account_deletion_request',
        entity_id: current.id,
        metadata: {
          event: 'account_deletion_requested',
          fulfillment: 'soft_deleted_and_anonymized',
          previous_status: current.status,
          new_status: 'inactive',
          documents_tombstoned: currentDocuments.length,
          profile_photo_removed: Boolean(current.profile_photo_url),
          sessions_revoked: true,
          storage_cleanup_scheduled: scheduledCleanupCount > 0,
          storage_cleanup_event_count: scheduledCleanupCount,
        },
      },
      select: { id: true },
    });

    return { auditId: audit.id, workerId: current.id };
  });

  return {
    request_id: result.auditId,
    worker_id: result.workerId,
    status: 'accepted',
    account_state: 'inactive',
    effective_at: effectiveAt,
  };
}

export async function getWorkerDocumentDownload(
  actor: { sub: string; role: string },
  workerId: string,
  type: string
) {
  const documentType = parseWorkerDocumentType(type);
  const worker = await prisma.worker.findFirst({
    where: { id: workerId, deleted_at: null },
    select: {
      id: true,
      user_id: true,
      status: true,
      documents: true,
    },
  });
  if (!worker) throw Errors.notFound('Worker document not found.', 'WORKER_DOCUMENT_NOT_FOUND');

  if (actor.role === 'worker') {
    if (worker.user_id !== actor.sub) {
      throw Errors.forbidden('Workers can only access their own documents.', 'WORKER_DOCUMENT_ACCESS_DENIED');
    }
  } else if (actor.role === 'company') {
    const company = await prisma.company.findFirst({
      where: { user_id: actor.sub, deleted_at: null, status: 'approved' },
      select: { id: true },
    });
    if (!company) throw Errors.forbidden('Company account is not approved.', 'WORKER_DOCUMENT_ACCESS_DENIED');

    const relatedAssignment = await prisma.assignment.findFirst({
      where: {
        worker_id: worker.id,
        deleted_at: null,
        status: { in: ['assigned', 'accepted', 'completed'] },
        order: { company_id: company.id, deleted_at: null },
      },
      select: { id: true },
    });
    if (!relatedAssignment) {
      throw Errors.forbidden('The worker is not assigned to this company.', 'WORKER_DOCUMENT_ACCESS_DENIED');
    }
  } else if (actor.role !== 'admin' && actor.role !== 'super_admin') {
    throw Errors.forbidden('Document access is not allowed for this role.', 'WORKER_DOCUMENT_ACCESS_DENIED');
  }

  if (worker.status === 'rejected') {
    throw Errors.gone('Rejected worker documents are not downloadable.', 'WORKER_DOCUMENT_REJECTED');
  }
  const document = normalizeDocuments(worker.documents).find((item) => item.type === documentType);
  if (!document) throw Errors.notFound('Worker document not found.', 'WORKER_DOCUMENT_NOT_FOUND');
  if (document.status === 'deleted' || document.deleted_at) {
    throw Errors.gone('Worker document has been deleted.', 'WORKER_DOCUMENT_DELETED');
  }
  if (actor.role === 'company' && !document.company_visible) {
    throw Errors.forbidden('This document is not visible to companies.', 'WORKER_DOCUMENT_ACCESS_DENIED');
  }
  if (!document.key) {
    throw Errors.gone(
      'This legacy document must be uploaded again before it can be downloaded securely.',
      'WORKER_DOCUMENT_REUPLOAD_REQUIRED'
    );
  }
  if (!privateDocumentKeyBelongsToWorker(document.key, worker.id, documentType)) {
    throw Errors.gone(
      'This document reference is not compatible with private storage and must be uploaded again.',
      'WORKER_DOCUMENT_REUPLOAD_REQUIRED'
    );
  }
  if (document.status !== 'ready' || document.scan_status !== 'clean') {
    throw Errors.gone(
      'This document has not completed security scanning and must be uploaded again.',
      'WORKER_DOCUMENT_SCAN_REQUIRED'
    );
  }

  const expiresInSeconds = signedDocumentUrlTtl();
  const url = await createUploadService().createSignedDownloadUrl(
    document.key,
    expiresInSeconds,
    document.name
  );
  await prisma.auditLog.create({
    data: {
      actor_id: actor.sub,
      actor_role: actor.role as Role,
      action: 'status_changed',
      entity_type: 'worker_document',
      entity_id: worker.id,
      metadata: {
        event: 'document_download_authorized',
        document_type: documentType,
        object_key_hash: hashObjectKey(document.key),
        expires_in_seconds: expiresInSeconds,
      },
    },
  });
  return {
    url,
    expires_in_seconds: expiresInSeconds,
    expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

export async function listWorkers(filters: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  worker_class?: string;
  foc_training?: string;
  sort?: 'asc' | 'desc';
  available?: boolean;
  position_id?: string;
}) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Record<string, unknown> = { deleted_at: null };

  if (filters.status && !WORKER_STATUSES.has(filters.status)) {
    throw Errors.badRequest('Invalid worker status filter.', 'INVALID_WORKER_STATUS');
  }

  if (filters.status) where.status = filters.status;
  if (filters.worker_class) {
    if (!WORKER_CLASSES.has(filters.worker_class)) {
      throw Errors.badRequest('Invalid worker class filter.', 'INVALID_WORKER_CLASS');
    }
    where.worker_class = filters.worker_class;
  }
  if (filters.foc_training) {
    if (!FOC_TRAINING_FILTERS.has(filters.foc_training)) {
      throw Errors.badRequest('Invalid F.O.C. training filter.', 'INVALID_FOC_TRAINING_FILTER');
    }
    where.is_foc_training = filters.foc_training === 'foc';
  }
  if (filters.available !== undefined) where.availability = filters.available;
  if (filters.position_id) where.positions = { some: { position_id: filters.position_id } };
  if (filters.search) {
    where.OR = [
      { position: { contains: filters.search, mode: 'insensitive' } },
      { user: { name: { contains: filters.search, mode: 'insensitive' } } },
      { user: { phone: { contains: filters.search } } },
      { positions: { some: { position: { name_az: { contains: filters.search, mode: 'insensitive' } } } } },
      { positions: { some: { position: { name_en: { contains: filters.search, mode: 'insensitive' } } } } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.worker.count({ where }),
    prisma.worker.findMany({
      where,
      include: workerProfileInclude,
      orderBy: { created_at: filters.sort ?? 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: data.map((worker: WorkerProfileRecord) => toWorkerProfile(worker, { includeWorkerClass: true })),
    meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function getWorkerById(id: string) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: {
      user: {
        select: {
          name: true,
          phone: true,
          email: true,
          otp_codes: {
            orderBy: { created_at: 'desc' },
            take: 5,
            select: {
              id: true,
              purpose: true,
              expires_at: true,
              verified_at: true,
              attempts: true,
              max_attempts: true,
              resend_count: true,
              blocked_until: true,
              created_at: true,
            },
          },
        },
      },
      positions: workerProfileInclude.positions,
    },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');

  return {
    ...toWorkerProfile(worker, { includeWorkerClass: true }),
    otp_status: worker.user.otp_codes,
    approval: {
      approved_at: worker.approved_at,
      approved_by_id: worker.approved_by_id,
      rejected_at: worker.rejected_at,
      rejected_by_id: worker.rejected_by_id,
    },
  };
}

export async function getCompanyVisibleWorkerProfile(userId: string, workerId: string) {
  const company = await prisma.company.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company must be approved before viewing worker profiles.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }

  const worker = await prisma.worker.findFirst({
    where: {
      id: workerId,
      deleted_at: null,
      assignments: {
        some: {
          deleted_at: null,
          status: { in: ['assigned', 'accepted', 'completed'] },
          order: { company_id: company.id, deleted_at: null },
        },
      },
    },
    include: {
      user: { select: { name: true } },
      positions: workerProfileInclude.positions,
    },
  });
  if (!worker) throw Errors.notFound('Worker not found for this company.', 'WORKER_NOT_FOUND');

  return toCompanyWorkerProfile(worker);
}

export async function approveWorker(id: string, actor: { sub: string; role: string }) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: {
      user: {
        include: {
          otp_codes: {
            where: { purpose: 'worker_registration', consumed_at: { not: null } },
            select: { id: true },
            take: 1,
          },
        },
      },
      positions: workerProfileInclude.positions,
    },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');
  if (worker.status === 'approved') {
    return toWorkerProfile(worker, { includeWorkerClass: true });
  }
  const missingPrerequisites = workerApprovalPrerequisites(worker);
  if (missingPrerequisites.length > 0) {
    throw Errors.conflict(
      'Worker registration prerequisites are incomplete.',
      'APPROVAL_PREREQUISITES_MISSING',
      { status: worker.status, missing: missingPrerequisites }
    );
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const transition = await tx.worker.updateMany({
      where: {
        id,
        status: 'pending_approval',
        deleted_at: null,
        user: {
          password_set_at: { not: null },
          is_active: true,
          deleted_at: null,
          otp_codes: {
            some: { purpose: 'worker_registration', consumed_at: { not: null } },
          },
        },
      },
      data: {
        status: 'approved' as WorkerStatus,
        reject_reason: null,
        approved_at: new Date(),
        approved_by_id: actor.sub,
      },
    });

    if (transition.count !== 1) {
      const current = await tx.worker.findFirst({
        where: { id, deleted_at: null },
        include: workerProfileInclude,
      });
      if (current?.status === 'approved') {
        return { worker: current, transitioned: false };
      }
      throw Errors.conflict('Worker approval state changed.', 'WORKER_APPROVAL_STATE_CHANGED');
    }

    const updatedWorker = await tx.worker.findUniqueOrThrow({
      where: { id },
      include: workerProfileInclude,
    });

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role as Role,
        action: 'worker_approved',
        entity_type: 'worker',
        entity_id: id,
        metadata: { previous_status: worker.status, new_status: updatedWorker.status },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: worker.user_id,
        type: 'worker_approved',
        title: 'Profil təsdiqləndi',
        body: 'İşçi profiliniz təsdiqləndi.',
        metadata: { worker_id: id },
      },
    });

    return { worker: updatedWorker, transitioned: true };
  });

  if (updated.transitioned) {
    await sendPushToUser(worker.user_id, {
      title: 'Profil təsdiqləndi',
      body: 'İşçi profiliniz təsdiqləndi.',
      data: { type: 'worker_approved', worker_id: id, role: 'worker' },
    });
  }

  return toWorkerProfile(updated.worker, { includeWorkerClass: true });
}

export async function rejectWorker(id: string, reason: string, actor: { sub: string; role: string }) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: { user: true, positions: workerProfileInclude.positions },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'pending_approval') {
    throw Errors.conflict(
      'Only a worker awaiting approval can be rejected.',
      'WORKER_REJECTION_NOT_PENDING',
      { status: worker.status }
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const transition = await tx.worker.updateMany({
      where: {
        id,
        status: 'pending_approval',
        deleted_at: null,
      },
      data: {
        status: 'rejected' as WorkerStatus,
        reject_reason: reason,
        rejected_at: now,
        rejected_by_id: actor.sub,
      },
    });

    if (transition.count !== 1) {
      const current = await tx.worker.findFirst({
        where: { id, deleted_at: null },
        select: { status: true },
      });
      throw Errors.conflict(
        'Worker rejection state changed. Please retry.',
        'WORKER_REJECTION_STATE_CHANGED',
        { status: current?.status ?? 'deleted' }
      );
    }

    const updatedWorker = await tx.worker.findUniqueOrThrow({
      where: { id },
      include: workerProfileInclude,
    });

    const rejectionPushTargets = await tx.deviceToken.findMany({
      where: { user_id: worker.user_id, revoked_at: null, deleted_at: null },
      select: { id: true, token: true },
    });
    await tx.user.update({
      where: { id: worker.user_id },
      data: { session_version: { increment: 1 } },
    });
    await tx.refreshToken.updateMany({
      where: { user_id: worker.user_id, revoked_at: null },
      data: { revoked_at: now, revoked_reason: 'account_change' },
    });
    await tx.deviceToken.updateMany({
      where: { user_id: worker.user_id, revoked_at: null },
      data: { revoked_at: now, deleted_at: now },
    });

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role as Role,
        action: 'worker_rejected',
        entity_type: 'worker',
        entity_id: id,
        metadata: { previous_status: worker.status, new_status: updatedWorker.status, reason },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: worker.user_id,
        type: 'worker_rejected',
        title: 'Profil rədd edildi',
        body: 'İşçi profiliniz rədd edildi.',
        metadata: { worker_id: id, reason },
      },
    });

    return { worker: updatedWorker, rejectionPushTargets };
  });

  await sendPushToDeviceTargets(updated.rejectionPushTargets, {
    title: 'Profil rədd edildi',
    body: 'İşçi profiliniz rədd edildi.',
    data: { type: 'worker_rejected', worker_id: id, role: 'worker' },
  });

  return toWorkerProfile(updated.worker, { includeWorkerClass: true });
}

function toWorkerProfile(worker: {
  id: string;
  user_id: string;
  user: {
    name: string;
    phone: string;
    email?: string | null;
    email_verified_at?: Date | null;
    pending_email?: string | null;
  };
  position?: string | null;
  profile_photo_url?: string | null;
  skills: unknown;
  languages?: unknown;
  documents?: unknown;
  work_history_summary?: string | null;
  work_history?: unknown;
  gender?: string | null;
  whatsapp_available?: boolean;
  status: string;
  reject_reason?: string | null;
  availability: boolean;
  worker_class?: string | null;
  is_foc_training?: boolean;
  foc_training_note?: string | null;
  foc_training_updated_at?: Date | null;
  foc_training_updated_by_id?: string | null;
  rating_avg: number;
  rating_count: number;
  positions?: Array<{
    position: {
      id: string;
      slug: string;
      name_az: string;
      name_en: string | null;
      status: string;
      subdepartment_id: string;
      subdepartment: {
        id: string;
        slug: string;
        name_az: string;
        name_en: string | null;
        status: string;
        department_id: string;
        department: {
          id: string;
          slug: string;
          name_az: string;
          name_en: string | null;
          status: string;
        };
      };
    };
  }>;
  created_at: Date;
  updated_at: Date;
}, options: { includeWorkerClass?: boolean } = {}) {
  const profile: {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    email?: string | null;
    email_verified_at?: Date | null;
    pending_email?: string | null;
    email_verified: boolean;
    position?: string | null;
    profile_photo_url?: string | null;
    skills: unknown;
    languages?: unknown;
    documents?: unknown;
    work_history_summary?: string | null;
    work_history?: unknown;
    gender?: string | null;
    whatsapp_available?: boolean;
    status: string;
    reject_reason?: string | null;
    availability: boolean;
    rating_avg: number;
    rating_count: number;
    rating_summary: { average: number; count: number };
    position_ids: string[];
    positions: Array<{
      id: string;
      slug: string;
      name_az: string;
      name_en: string | null;
      status: string;
      subdepartment_id: string;
      department_id: string;
      subdepartment: {
        id: string;
        slug: string;
        name_az: string;
        name_en: string | null;
        status: string;
      };
      department: {
        id: string;
        slug: string;
        name_az: string;
        name_en: string | null;
        status: string;
      };
    }>;
    created_at: Date;
    updated_at: Date;
    worker_class?: string | null;
    is_foc_training: boolean;
    foc_training_note: string | null;
    foc_training_updated_at: Date | null;
    foc_training_updated_by_id: string | null;
  } = {
    id: worker.id,
    user_id: worker.user_id,
    name: worker.user.name,
    phone: worker.user.phone,
    email: worker.user.email ?? null,
    email_verified_at: worker.user.email_verified_at ?? null,
    pending_email: worker.user.pending_email ?? null,
    email_verified: Boolean(worker.user.email && worker.user.email_verified_at),
    position: worker.position,
    profile_photo_url: worker.profile_photo_url,
    skills: worker.skills,
    languages: worker.languages,
    documents: documentResponseMetadata(worker.documents, worker.id),
    work_history_summary: worker.work_history_summary,
    work_history: worker.work_history,
    gender: worker.gender,
    whatsapp_available: worker.whatsapp_available,
    status: worker.status,
    reject_reason: worker.reject_reason,
    availability: worker.availability,
    is_foc_training: worker.is_foc_training ?? false,
    foc_training_note: worker.foc_training_note ?? null,
    foc_training_updated_at: worker.foc_training_updated_at ?? null,
    foc_training_updated_by_id: worker.foc_training_updated_by_id ?? null,
    rating_avg: worker.rating_avg,
    rating_count: worker.rating_count,
    rating_summary: {
      average: worker.rating_avg,
      count: worker.rating_count,
    },
    position_ids: (worker.positions ?? []).map((item) => item.position.id),
    positions: (worker.positions ?? []).map((item) => toWorkerPositionResponse(item.position)),
    created_at: worker.created_at,
    updated_at: worker.updated_at,
  };
  if (options.includeWorkerClass) profile.worker_class = worker.worker_class ?? null;
  return profile;
}

function toCompanyWorkerProfile(worker: {
  id: string;
  user: { name: string };
  position?: string | null;
  profile_photo_url?: string | null;
  skills: unknown;
  languages?: unknown;
  documents?: unknown;
  work_history_summary?: string | null;
  work_history?: unknown;
  gender?: string | null;
  rating_avg: number;
  rating_count: number;
  positions?: Array<{
    position: {
      id: string;
      slug: string;
      name_az: string;
      name_en: string | null;
      status: string;
      subdepartment_id: string;
      subdepartment: {
        id: string;
        slug: string;
        name_az: string;
        name_en: string | null;
        status: string;
        department_id: string;
        department: {
          id: string;
          slug: string;
          name_az: string;
          name_en: string | null;
          status: string;
        };
      };
    };
  }>;
}) {
  return {
    id: worker.id,
    name: worker.user.name,
    position: worker.position,
    profile_photo_url: worker.profile_photo_url,
    skills: worker.skills,
    languages: worker.languages,
    documents: companyVisibleDocuments(worker.documents, worker.id),
    work_history_summary: worker.work_history_summary,
    work_history: worker.work_history,
    gender: worker.gender,
    rating_avg: worker.rating_avg,
    rating_count: worker.rating_count,
    rating_summary: {
      average: worker.rating_avg,
      count: worker.rating_count,
    },
    position_ids: (worker.positions ?? []).map((item) => item.position.id),
    positions: (worker.positions ?? []).map((item) => toWorkerPositionResponse(item.position)),
  };
}

function toWorkerPositionResponse(position: {
  id: string;
  slug: string;
  name_az: string;
  name_en: string | null;
  status: string;
  subdepartment_id: string;
  subdepartment: {
    id: string;
    slug: string;
    name_az: string;
    name_en: string | null;
    status: string;
    department_id: string;
    department: {
      id: string;
      slug: string;
      name_az: string;
      name_en: string | null;
      status: string;
    };
  };
}) {
  return {
    id: position.id,
    slug: position.slug,
    name_az: position.name_az,
    name_en: position.name_en,
    status: position.status,
    subdepartment_id: position.subdepartment_id,
    department_id: position.subdepartment.department_id,
    subdepartment: {
      id: position.subdepartment.id,
      slug: position.subdepartment.slug,
      name_az: position.subdepartment.name_az,
      name_en: position.subdepartment.name_en,
      status: position.subdepartment.status,
    },
    department: {
      id: position.subdepartment.department.id,
      slug: position.subdepartment.department.slug,
      name_az: position.subdepartment.department.name_az,
      name_en: position.subdepartment.department.name_en,
      status: position.subdepartment.department.status,
    },
  };
}

async function resolveWorkerPositions(positionIds: string[]) {
  const uniqueIds = [...new Set(positionIds)];
  const positions = await TaxonomyService.findActivePositionsByIds(uniqueIds);
  if (positions.length !== uniqueIds.length) {
    throw Errors.badRequest('Seçilmiş vəzifələrdən biri aktiv deyil və ya tapılmadı.', 'POSITION_NOT_FOUND', {
      position_ids: uniqueIds,
    });
  }
  return positions;
}

async function getApprovedWorkerRecord(userId: string) {
  const worker = await prisma.worker.findUnique({
    where: { user_id: userId },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  if (!worker || worker.deleted_at) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before updating worker profile.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }
  return worker;
}

async function getDocumentEnrollmentWorkerRecord(userId: string) {
  const worker = await prisma.worker.findUnique({
    where: { user_id: userId },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  if (!worker || worker.deleted_at) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  if (!['pending_approval', 'approved'].includes(worker.status)) {
    throw Errors.forbidden('Worker registration does not accept documents.', 'WORKER_ENROLLMENT_CLOSED', {
      status: worker.status,
    });
  }
  return worker;
}

type WorkerDocumentType = 'health_certificate' | 'criminal_record';

type WorkerDocument = {
  type: string;
  name?: string;
  url?: string;
  key?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  company_visible?: boolean;
  status?: 'quarantine' | 'ready' | 'rejected' | 'deleted';
  scan_status?: 'pending' | 'clean' | 'infected' | 'error';
  scanner?: string;
  scanned_at?: string;
  content_sha256?: string;
  deleted_at?: string;
};

type StoredObjectCleanup = {
  key: string;
  visibility: 'public' | 'private';
};

function parseWorkerDocumentType(value: string | undefined): WorkerDocumentType {
  if (value === 'health_certificate' || value === 'criminal_record') return value;
  throw Errors.badRequest('Invalid worker document type.', 'INVALID_DOCUMENT_TYPE');
}

type WorkerUploadInput = {
  workerId: string;
  file: Express.Multer.File | undefined;
  folder: string;
  allowedMimeTypes: Set<string>;
};

type SecuredUploadMetadata = {
  inspection: InspectedUpload;
  scan: MalwareScanResult;
};

type PublicWorkerUploadResult = UploadObjectResult & SecuredUploadMetadata;
type PrivateWorkerUploadResult = PrivateUploadObjectResult & SecuredUploadMetadata;

async function putWorkerUpload(
  input: WorkerUploadInput & { visibility: 'public' }
): Promise<PublicWorkerUploadResult>;
async function putWorkerUpload(
  input: WorkerUploadInput & { visibility: 'private' }
): Promise<PrivateWorkerUploadResult>;
async function putWorkerUpload(
  input: WorkerUploadInput & { visibility: 'public' | 'private' }
): Promise<PublicWorkerUploadResult | PrivateWorkerUploadResult> {
  const file = input.file;
  if (!file) throw Errors.badRequest('Upload file is required.', 'UPLOAD_FILE_REQUIRED');

  const service = createUploadService();
  const inspection = await inspectUpload(file, input.allowedMimeTypes);
  const finalKey = `workers/${input.workerId}/${input.folder}/${crypto.randomUUID()}${inspection.extension}`;

  if (input.visibility === 'public') {
    const sanitized = await sanitizePublicImageUpload(file.buffer, inspection);
    const scan = await scanUpload(sanitized.body, sanitized.inspection, { sensitive: false });
    const uploaded = await service.putObject({
      key: finalKey,
      contentType: sanitized.inspection.detectedMimeType,
      body: sanitized.body,
    });
    return { ...uploaded, inspection: sanitized.inspection, scan };
  }

  const quarantineKey =
    `workers/${input.workerId}/quarantine/${crypto.randomUUID()}${inspection.extension}`;
  await service.putPrivateObject({
    key: quarantineKey,
    contentType: inspection.detectedMimeType,
    body: file.buffer,
    downloadName: inspection.safeOriginalName,
  });

  try {
    const scan = await scanUpload(file.buffer, inspection, { sensitive: true });
    const promoted = await service.promotePrivateObject(quarantineKey, finalKey);
    return { ...promoted, inspection, scan };
  } catch (error) {
    await deleteObjectBestEffort(quarantineKey, 'private', 'quarantine_cleanup');
    await deleteObjectBestEffort(finalKey, 'private', 'failed_promotion_cleanup');
    throw error;
  }
}

function normalizeDocuments(value: unknown): WorkerDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const document = item as Record<string, unknown>;
    const type = typeof document.type === 'string' ? document.type : '';
    const url = typeof document.url === 'string' ? document.url : undefined;
    const key = typeof document.key === 'string' ? document.key : undefined;
    const status = isDocumentStatus(document.status) ? document.status : undefined;
    if (!type || (!url && !key && status !== 'deleted')) return [];
    return [
      {
        type,
        url,
        name: typeof document.name === 'string' ? document.name : undefined,
        key,
        mime_type: typeof document.mime_type === 'string' ? document.mime_type : undefined,
        size_bytes: typeof document.size_bytes === 'number' ? document.size_bytes : undefined,
        uploaded_at: typeof document.uploaded_at === 'string' ? document.uploaded_at : undefined,
        company_visible: document.company_visible === true,
        status,
        scan_status: isScanStatus(document.scan_status) ? document.scan_status : undefined,
        scanner: typeof document.scanner === 'string' ? document.scanner : undefined,
        scanned_at: typeof document.scanned_at === 'string' ? document.scanned_at : undefined,
        content_sha256: typeof document.content_sha256 === 'string' ? document.content_sha256 : undefined,
        deleted_at: typeof document.deleted_at === 'string' ? document.deleted_at : undefined,
      },
    ];
  });
}

function deletedDocumentTombstone(document: WorkerDocument, deletedAt: string): WorkerDocument {
  return {
    type: document.type,
    company_visible: false,
    status: 'deleted',
    deleted_at: deletedAt,
  };
}

function documentStorageCleanup(
  document: WorkerDocument,
  workerId: string
): StoredObjectCleanup | null {
  if (
    document.key
    && privateDocumentKeyBelongsToWorker(document.key, workerId, document.type)
  ) {
    return { key: document.key, visibility: 'private' };
  }

  const publicKey = publicObjectKeyFromUrl(document.url);
  if (publicKey?.startsWith(`workers/${workerId}/`)) {
    return { key: publicKey, visibility: 'public' };
  }
  return null;
}

function profilePhotoStorageCleanup(
  profilePhotoUrl: string | null | undefined,
  workerId: string
): StoredObjectCleanup | null {
  const publicKey = publicObjectKeyFromUrl(profilePhotoUrl);
  if (!publicKey?.startsWith(`workers/${workerId}/profile-photo/`)) return null;
  return { key: publicKey, visibility: 'public' };
}

function companyVisibleDocuments(value: unknown, workerId: string) {
  return documentResponseMetadata(value, workerId, true);
}

function documentResponseMetadata(value: unknown, workerId: string, companyOnly = false) {
  return normalizeDocuments(value)
    .filter((document) => !document.deleted_at && document.status !== 'deleted' && document.status !== 'rejected')
    .filter((document) => !companyOnly || document.company_visible === true)
    .map((document) => {
      const hasOwnedPrivateKey = Boolean(
        document.key &&
        document.status === 'ready' &&
        document.scan_status === 'clean' &&
        privateDocumentKeyBelongsToWorker(document.key, workerId, document.type)
      );
      const downloadUrl = hasOwnedPrivateKey
        ? `/v1/workers/${workerId}/documents/${document.type}/download`
        : undefined;
      return {
        type: document.type,
        name: document.name,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes,
        uploaded_at: document.uploaded_at,
        company_visible: document.company_visible === true,
        status: document.status ?? 'legacy',
        scan_status: document.scan_status ?? 'unscanned',
        available: hasOwnedPrivateKey,
        ...(downloadUrl ? { url: downloadUrl, download_url: downloadUrl } : {}),
      };
    });
}

function privateDocumentKeyBelongsToWorker(key: string, workerId: string, type: string): boolean {
  return key.startsWith(`workers/${workerId}/documents/${type}/`);
}

function workerApprovalPrerequisites(worker: {
  id: string;
  status: string;
  position: string | null;
  documents: unknown;
  positions: unknown[];
  user: {
    name: string;
    phone: string;
    password_set_at: Date | null;
    is_active: boolean;
    deleted_at: Date | null;
    otp_codes: { id: string }[];
  };
}): string[] {
  const missing: string[] = [];
  if (worker.status !== 'pending_approval') missing.push('status_pending_approval');
  if (!worker.user.password_set_at) missing.push('password_set');
  if (!worker.user.is_active || worker.user.deleted_at) missing.push('active_account');
  if (worker.user.otp_codes.length === 0) missing.push('registration_otp_consumed');
  if (!worker.user.name.trim()) missing.push('full_name');
  if (!worker.user.phone.trim()) missing.push('phone');
  if (!worker.position?.trim() && worker.positions.length === 0) missing.push('position');

  const documents = normalizeDocuments(worker.documents);
  for (const type of ['health_certificate', 'criminal_record'] as const) {
    const document = documents.find((item) => item.type === type);
    if (
      !document?.key
      || document.status !== 'ready'
      || document.scan_status !== 'clean'
      || !privateDocumentKeyBelongsToWorker(document.key, worker.id, type)
    ) {
      missing.push(`document:${type}`);
    }
  }
  return missing;
}

async function deletePrivateObjectBestEffort(key: string, reason: string): Promise<void> {
  await deleteObjectBestEffort(key, 'private', reason);
}

async function deleteObjectBestEffort(
  key: string,
  visibility: 'public' | 'private',
  reason: string
): Promise<void> {
  try {
    await createUploadService().deleteObject(key, visibility);
  } catch (error) {
    logger.warn('upload_cleanup_failed', {
      reason,
      visibility,
      key_hash: crypto.createHash('sha256').update(key).digest('hex'),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function publicObjectKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const baseUrl = (process.env.STORAGE_PUBLIC_BASE_URL ?? '/uploads').replace(/\/+$/, '');
  if (baseUrl.startsWith('/')) {
    const prefix = `${baseUrl}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
  try {
    const base = new URL(`${baseUrl}/`);
    const target = new URL(url);
    if (base.origin !== target.origin || !target.pathname.startsWith(base.pathname)) return null;
    return decodeURIComponent(target.pathname.slice(base.pathname.length));
  } catch {
    return null;
  }
}

function signedDocumentUrlTtl(): number {
  const value = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? 300);
  return Number.isInteger(value) && value >= 1 && value <= 900 ? value : 300;
}

function hashObjectKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function isDocumentStatus(value: unknown): value is NonNullable<WorkerDocument['status']> {
  return value === 'quarantine' || value === 'ready' || value === 'rejected' || value === 'deleted';
}

function isScanStatus(value: unknown): value is NonNullable<WorkerDocument['scan_status']> {
  return value === 'pending' || value === 'clean' || value === 'infected' || value === 'error';
}
