import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { Role, WorkerStatus } from '../../types/prisma';

const WORKER_STATUSES = new Set<string>([
  'draft',
  'pending_otp',
  'pending_approval',
  'approved',
  'rejected',
  'suspended',
  'inactive',
]);

export async function getMyWorker(userId: string) {
  const worker = await prisma.worker.findUnique({
    where: { user_id: userId },
    include: { user: { select: { name: true, phone: true } } },
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
  data: { skills?: unknown; languages?: unknown; documents?: unknown; availability?: boolean }
) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker || worker.deleted_at) throw Errors.notFound('Worker profile not found.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Worker must be approved before using worker APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }

  const updated = await prisma.worker.update({
    where: { user_id: userId },
    data,
    include: { user: { select: { name: true, phone: true } } },
  });
  return toWorkerProfile(updated);
}

export async function listWorkers(filters: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: 'asc' | 'desc';
  available?: boolean;
}) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Record<string, unknown> = { deleted_at: null };

  if (filters.status && !WORKER_STATUSES.has(filters.status)) {
    throw Errors.badRequest('Invalid worker status filter.', 'INVALID_WORKER_STATUS');
  }

  if (filters.status) where.status = filters.status;
  if (filters.available !== undefined) where.availability = filters.available;
  if (filters.search) {
    where.OR = [
      { position: { contains: filters.search, mode: 'insensitive' } },
      { user: { name: { contains: filters.search, mode: 'insensitive' } } },
      { user: { phone: { contains: filters.search } } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.worker.count({ where }),
    prisma.worker.findMany({
      where,
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: filters.sort ?? 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: data.map(toWorkerProfile),
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
    },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');

  return {
    ...toWorkerProfile(worker),
    otp_status: worker.user.otp_codes,
    approval: {
      approved_at: worker.approved_at,
      approved_by_id: worker.approved_by_id,
      rejected_at: worker.rejected_at,
      rejected_by_id: worker.rejected_by_id,
    },
  };
}

export async function approveWorker(id: string, actor: { sub: string; role: string }) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: { user: true },
  });
  if (!worker) throw Errors.notFound('Worker not found.', 'WORKER_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedWorker = await tx.worker.update({
      where: { id },
      data: {
        status: 'approved' as WorkerStatus,
        reject_reason: null,
        approved_at: new Date(),
        approved_by_id: actor.sub,
      },
      include: { user: { select: { name: true, phone: true } } },
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
        title: 'Worker approved',
        body: 'Your worker profile has been approved.',
        metadata: { worker_id: id },
      },
    });

    return updatedWorker;
  });

  return toWorkerProfile(updated);
}

export async function rejectWorker(id: string, reason: string, actor: { sub: string; role: string }) {
  const worker = await prisma.worker.findFirst({
    where: { id, deleted_at: null },
    include: { user: true },
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
      include: { user: { select: { name: true, phone: true } } },
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
        title: 'Worker rejected',
        body: 'Your worker profile was rejected.',
        metadata: { worker_id: id, reason },
      },
    });

    return updatedWorker;
  });

  return toWorkerProfile(updated);
}

function toWorkerProfile(worker: {
  id: string;
  user_id: string;
  user: { name: string; phone: string };
  position?: string | null;
  skills: unknown;
  languages?: unknown;
  documents?: unknown;
  status: string;
  reject_reason?: string | null;
  availability: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: worker.id,
    user_id: worker.user_id,
    name: worker.user.name,
    phone: worker.user.phone,
    position: worker.position,
    skills: worker.skills,
    languages: worker.languages,
    documents: worker.documents,
    status: worker.status,
    reject_reason: worker.reject_reason,
    availability: worker.availability,
    rating_avg: worker.rating_avg,
    rating_count: worker.rating_count,
    created_at: worker.created_at,
    updated_at: worker.updated_at,
  };
}
