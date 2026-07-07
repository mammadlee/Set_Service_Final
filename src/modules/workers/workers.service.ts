import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPushToUser } from '../../lib/fcm';
import { createUploadService } from '../../lib/uploads';
import { normalizeEmail } from '../../lib/password';
import { Role, WorkerClass, WorkerStatus } from '../../types/prisma';
import * as TaxonomyService from '../taxonomy/taxonomy.service';
import { startEmailVerification } from '../auth/auth.service';

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
    documents?: unknown;
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

  const { email, position_ids, ...workerData } = data;
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
  const worker = await getApprovedWorkerRecord(userId);
  const upload = await putWorkerUpload({
    workerId: worker.id,
    file,
    folder: 'profile-photo',
    allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  });

  const updated = await prisma.worker.update({
    where: { id: worker.id },
    data: { profile_photo_url: upload.url },
    include: workerProfileInclude,
  });

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

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
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
  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
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
  });

  const currentDocuments = normalizeDocuments(worker.documents);
  const nextDocument: WorkerDocument = {
    type: documentType,
    name: file!.originalname || documentType,
    url: upload.url,
    key: upload.key,
    mime_type: file!.mimetype,
    size_bytes: file!.size,
    uploaded_at: new Date().toISOString(),
    company_visible: documentType === 'health_certificate',
  };
  const nextDocuments = [
    ...currentDocuments.filter((document) => document.type !== documentType),
    nextDocument,
  ];

  const updated = await prisma.worker.update({
    where: { id: worker.id },
    data: { documents: nextDocuments as Prisma.InputJsonValue },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });

  return toWorkerProfile(updated);
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
    include: { user: true, positions: workerProfileInclude.positions },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');
  if (worker.status === 'approved') {
    return toWorkerProfile(worker, { includeWorkerClass: true });
  }

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedWorker = await tx.worker.update({
      where: { id },
      data: {
        status: 'approved' as WorkerStatus,
        reject_reason: null,
        approved_at: new Date(),
        approved_by_id: actor.sub,
      },
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

    return updatedWorker;
  });

  await sendPushToUser(worker.user_id, {
    title: 'Profil təsdiqləndi',
    body: 'İşçi profiliniz təsdiqləndi.',
    data: { type: 'worker_approved', worker_id: id, role: 'worker' },
  });

  return toWorkerProfile(updated, { includeWorkerClass: true });
}

export async function rejectWorker(id: string, reason: string, actor: { sub: string; role: string }) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: { user: true, positions: workerProfileInclude.positions },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedWorker = await tx.worker.update({
      where: { id },
      data: {
        status: 'rejected' as WorkerStatus,
        reject_reason: reason,
        rejected_at: new Date(),
        rejected_by_id: actor.sub,
      },
      include: workerProfileInclude,
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

    return updatedWorker;
  });

  await sendPushToUser(worker.user_id, {
    title: 'Profil rədd edildi',
    body: 'İşçi profiliniz rədd edildi.',
    data: { type: 'worker_rejected', worker_id: id, role: 'worker' },
  });

  return toWorkerProfile(updated, { includeWorkerClass: true });
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
    documents: worker.documents,
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
    documents: companyVisibleDocuments(worker.documents),
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

type WorkerDocumentType = 'health_certificate' | 'criminal_record';

type WorkerDocument = {
  type: string;
  name?: string;
  url: string;
  key?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  company_visible?: boolean;
};

function parseWorkerDocumentType(value: string | undefined): WorkerDocumentType {
  if (value === 'health_certificate' || value === 'criminal_record') return value;
  throw Errors.badRequest('Invalid worker document type.', 'INVALID_DOCUMENT_TYPE');
}

async function putWorkerUpload(input: {
  workerId: string;
  file: Express.Multer.File | undefined;
  folder: string;
  allowedMimeTypes: Set<string>;
}) {
  const file = input.file;
  if (!file) throw Errors.badRequest('Upload file is required.', 'UPLOAD_FILE_REQUIRED');
  if (!input.allowedMimeTypes.has(file.mimetype)) {
    throw Errors.badRequest('Unsupported upload MIME type.', 'UPLOAD_MIME_NOT_ALLOWED', {
      allowed: [...input.allowedMimeTypes],
    });
  }

  const service = createUploadService();
  const extension = extensionForMimeType(file.mimetype);
  const key = `workers/${input.workerId}/${input.folder}/${crypto.randomUUID()}-${safeFileName(file.originalname, extension)}`;
  return service.putObject({
    key,
    contentType: file.mimetype,
    body: file.buffer,
  });
}

function normalizeDocuments(value: unknown): WorkerDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const document = item as Record<string, unknown>;
    const type = typeof document.type === 'string' ? document.type : '';
    const url = typeof document.url === 'string' ? document.url : '';
    if (!type || !url) return [];
    return [
      {
        type,
        url,
        name: typeof document.name === 'string' ? document.name : undefined,
        key: typeof document.key === 'string' ? document.key : undefined,
        mime_type: typeof document.mime_type === 'string' ? document.mime_type : undefined,
        size_bytes: typeof document.size_bytes === 'number' ? document.size_bytes : undefined,
        uploaded_at: typeof document.uploaded_at === 'string' ? document.uploaded_at : undefined,
        company_visible: document.company_visible === true,
      },
    ];
  });
}

function companyVisibleDocuments(value: unknown): WorkerDocument[] {
  return normalizeDocuments(value).filter(
    (document) => document.type === 'health_certificate' || document.company_visible === true
  );
}

function extensionForMimeType(mimeType: string): string {
  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    } satisfies Record<string, string>
  )[mimeType] ?? 'bin';
}

function safeFileName(originalName: string, extension: string): string {
  const base = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'upload'}.${extension}`;
}
