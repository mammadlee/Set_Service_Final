import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { OrderStatus, Role } from '../../types/prisma';
import {
  completeOrderWhenFinished,
  markOrderInProgress,
  ORDER_ATTENDANCE_STATUSES,
} from '../orders/orders.lifecycle';

export type AttendanceQrContext = {
  tokenHash: string;
  nonce: string;
  assignmentId?: string;
  orderId: string;
  companyId: string;
  kioskId?: string;
  kioskSessionId?: string;
};

type AttendanceQrConsumeResult =
  | { kind: 'consumed' }
  | { kind: 'qr_invalid' | 'qr_expired' | 'qr_revoked' | 'qr_replayed' };

export const attendanceInclude = {
  assignment: {
    select: {
      id: true,
      status: true,
      worker_id: true,
      order_id: true,
      worker: {
        select: {
          id: true,
          status: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
      order: {
        select: {
          id: true,
          title: true,
          status: true,
          company_id: true,
          shift_start: true,
          shift_end: true,
          company: {
            select: {
              id: true,
              name: true,
              status: true,
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AttendanceLogInclude;

export type AttendanceWithRelations = Prisma.AttendanceLogGetPayload<{
  include: typeof attendanceInclude;
}>;

export const kioskSessionInclude = {
  company: {
    select: {
      id: true,
      name: true,
      status: true,
      user_id: true,
      deleted_at: true,
    },
  },
  order: {
    select: {
      id: true,
      title: true,
      status: true,
      shift_start: true,
      shift_end: true,
      location: true,
      company_id: true,
      deleted_at: true,
    },
  },
  assignment: {
    select: {
      id: true,
      order_id: true,
      worker_id: true,
      status: true,
      assigned_category: true,
      deleted_at: true,
      order_category_item: { select: { id: true, category: true } },
    },
  },
} satisfies Prisma.KioskSessionInclude;

export type KioskSessionWithContext = Prisma.KioskSessionGetPayload<{
  include: typeof kioskSessionInclude;
}>;

export const venueKioskInclude = {
  company: {
    select: {
      id: true,
      name: true,
      status: true,
      user_id: true,
      deleted_at: true,
    },
  },
  active_sessions: {
    where: { deleted_at: null, status: 'active', revoked_at: null },
    orderBy: { activated_at: 'desc' },
    take: 1,
    include: {
      order: {
        select: {
          id: true,
          title: true,
          status: true,
          shift_start: true,
          shift_end: true,
          location: true,
          company_id: true,
          deleted_at: true,
        },
      },
    },
  },
} satisfies Prisma.VenueKioskInclude;

export type VenueKioskWithContext = Prisma.VenueKioskGetPayload<{
  include: typeof venueKioskInclude;
}>;

export function findCompanyByUserId(userId: string) {
  return prisma.company.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findWorkerByUserId(userId: string) {
  return prisma.worker.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findAcceptedAssignmentById(id: string) {
  return prisma.assignment.findFirst({
    where: { id, deleted_at: null },
    include: {
      worker: { select: { id: true, user_id: true, status: true } },
      order: {
        select: {
          id: true,
          title: true,
          status: true,
          company_id: true,
          deleted_at: true,
          company: { select: { id: true, name: true, status: true, user_id: true } },
        },
      },
    },
  });
}

export function findAcceptedAssignmentForWorkerOrder(workerId: string, orderId: string) {
  return prisma.assignment.findFirst({
    where: {
      worker_id: workerId,
      order_id: orderId,
      status: 'accepted',
      deleted_at: null,
    },
    include: {
      worker: { select: { id: true, user_id: true, status: true } },
      order: {
        select: {
          id: true,
          title: true,
          status: true,
          company_id: true,
          deleted_at: true,
          company: { select: { id: true, name: true, status: true, user_id: true } },
        },
      },
    },
  });
}

export function findOrderForKiosk(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deleted_at: null },
    select: {
      id: true,
      title: true,
      status: true,
      company_id: true,
      deleted_at: true,
      _count: {
        select: {
          assignments: {
            where: { status: 'accepted', deleted_at: null },
          },
        },
      },
    },
  });
}

export function createVenueKiosk(input: {
  tokenHash: string;
  tokenCiphertext: string;
  companyId: string;
  name: string;
  locationLabel?: string;
  createdById: string;
}) {
  return prisma.venueKiosk.create({
    data: {
      token_hash: input.tokenHash,
      token_ciphertext: input.tokenCiphertext,
      company_id: input.companyId,
      name: input.name,
      location_label: input.locationLabel,
      created_by_id: input.createdById,
    },
    include: venueKioskInclude,
  });
}

export function listVenueKiosks(where: Prisma.VenueKioskWhereInput) {
  return prisma.venueKiosk.findMany({
    where,
    include: venueKioskInclude,
    orderBy: { created_at: 'desc' },
  });
}

export function findVenueKioskById(id: string) {
  return prisma.venueKiosk.findFirst({
    where: { id, deleted_at: null },
    include: venueKioskInclude,
  });
}

export function findVenueKioskByTokenHash(tokenHash: string) {
  return prisma.venueKiosk.findFirst({
    where: { token_hash: tokenHash, deleted_at: null },
    include: venueKioskInclude,
  });
}

export function activateVenueKiosk(input: {
  kioskId: string;
  companyId: string;
  orderId: string;
  activatedById: string;
  expiresAt?: Date;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "venue_kiosks"
      WHERE id = ${input.kioskId}
        AND company_id = ${input.companyId}
        AND status = 'active'
        AND revoked_at IS NULL
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (locked.length !== 1) return null;

    const now = new Date();
    await tx.kioskActiveSession.updateMany({
      where: {
        kiosk_id: input.kioskId,
        status: 'active',
        revoked_at: null,
        deleted_at: null,
      },
      data: {
        status: 'revoked',
        revoked_at: now,
      },
    });
    await tx.attendanceQrToken.updateMany({
      where: { kiosk_id: input.kioskId, revoked_at: null, deleted_at: null },
      data: { revoked_at: now },
    });

    await tx.kioskActiveSession.create({
      data: {
        kiosk_id: input.kioskId,
        company_id: input.companyId,
        order_id: input.orderId,
        activated_by_id: input.activatedById,
        expires_at: input.expiresAt,
      },
    });

    return tx.venueKiosk.findFirstOrThrow({
      where: { id: input.kioskId, deleted_at: null },
      include: venueKioskInclude,
    });
  });
}

export function deactivateVenueKiosk(input: { id: string; companyId?: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = input.companyId
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "venue_kiosks"
          WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
          FOR UPDATE
        `
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "venue_kiosks"
          WHERE id = ${input.id} AND deleted_at IS NULL
          FOR UPDATE
        `;
    if (locked.length !== 1) return null;

    const now = new Date();
    await tx.kioskActiveSession.updateMany({
      where: {
        kiosk_id: input.id,
        status: 'active',
        revoked_at: null,
        deleted_at: null,
      },
      data: {
        status: 'revoked',
        revoked_at: now,
      },
    });
    await tx.attendanceQrToken.updateMany({
      where: { kiosk_id: input.id, revoked_at: null, deleted_at: null },
      data: { revoked_at: now },
    });

    return tx.venueKiosk.findFirst({
      where: { id: input.id, deleted_at: null },
      include: venueKioskInclude,
    });
  });
}

export function disableVenueKiosk(input: { id: string; companyId?: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = input.companyId
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "venue_kiosks"
          WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
          FOR UPDATE
        `
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "venue_kiosks"
          WHERE id = ${input.id} AND deleted_at IS NULL
          FOR UPDATE
        `;
    if (locked.length !== 1) return null;

    const now = new Date();
    const update = await tx.venueKiosk.updateMany({
      where: {
        id: input.id,
        deleted_at: null,
        status: 'active',
        ...(input.companyId ? { company_id: input.companyId } : {}),
      },
      data: {
        status: 'disabled',
        revoked_at: now,
      },
    });
    if (update.count !== 1) return null;

    await tx.kioskActiveSession.updateMany({
      where: {
        kiosk_id: input.id,
        status: 'active',
        revoked_at: null,
        deleted_at: null,
      },
      data: {
        status: 'revoked',
        revoked_at: now,
      },
    });
    await tx.attendanceQrToken.updateMany({
      where: { kiosk_id: input.id, revoked_at: null, deleted_at: null },
      data: { revoked_at: now },
    });

    return tx.venueKiosk.findFirst({
      where: { id: input.id, deleted_at: null },
      include: venueKioskInclude,
    });
  });
}

export function createKioskSession(input: {
  tokenHash: string;
  companyId: string;
  orderId: string;
  assignmentId: string;
  createdById: string;
  expiresAt?: Date;
}) {
  return prisma.kioskSession.create({
    data: {
      token_hash: input.tokenHash,
      company_id: input.companyId,
      order_id: input.orderId,
      assignment_id: input.assignmentId,
      created_by_id: input.createdById,
      expires_at: input.expiresAt,
    },
    include: kioskSessionInclude,
  });
}

export function findKioskSessionByTokenHash(tokenHash: string) {
  return prisma.kioskSession.findFirst({
    where: { token_hash: tokenHash, deleted_at: null },
    include: kioskSessionInclude,
  });
}

export function findKioskSessionById(id: string) {
  return prisma.kioskSession.findFirst({
    where: { id, deleted_at: null },
    include: kioskSessionInclude,
  });
}

export function revokeKioskSession(input: { id: string; companyId?: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = input.companyId
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "kiosk_sessions"
          WHERE id = ${input.id} AND company_id = ${input.companyId}
            AND deleted_at IS NULL AND revoked_at IS NULL
          FOR UPDATE
        `
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "kiosk_sessions"
          WHERE id = ${input.id} AND deleted_at IS NULL AND revoked_at IS NULL
          FOR UPDATE
        `;
    if (locked.length !== 1) return { count: 0 };

    const now = new Date();
    const result = await tx.kioskSession.updateMany({
      where: { id: input.id, deleted_at: null, revoked_at: null },
      data: { revoked_at: now },
    });
    await tx.attendanceQrToken.updateMany({
      where: { kiosk_session_id: input.id, revoked_at: null, deleted_at: null },
      data: { revoked_at: now },
    });
    return result;
  });
}

export function registerAttendanceQrToken(input: AttendanceQrContext & { expiresAt: Date }) {
  return prisma.attendanceQrToken.create({
    data: {
      token_hash: input.tokenHash,
      nonce: input.nonce,
      assignment_id: input.assignmentId,
      order_id: input.orderId,
      company_id: input.companyId,
      kiosk_id: input.kioskId,
      kiosk_session_id: input.kioskSessionId,
      expires_at: input.expiresAt,
    },
    select: { id: true },
  });
}

async function consumeAttendanceQrToken(
  tx: Prisma.TransactionClient,
  input: {
    qr: AttendanceQrContext;
    assignmentId: string;
    workerId: string;
    action: 'checkin' | 'checkout';
  },
): Promise<AttendanceQrConsumeResult> {
  const { qr } = input;

  // Revocation and consumption take capability locks in the same order:
  // physical/legacy session first, then the persisted short-lived QR grant.
  if (qr.kioskId && qr.kioskSessionId) {
    const lockedKiosk = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "venue_kiosks"
      WHERE id = ${qr.kioskId}
      FOR UPDATE
    `;
    const lockedSession = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "kiosk_active_sessions"
      WHERE id = ${qr.kioskSessionId}
      FOR UPDATE
    `;
    if (lockedKiosk.length !== 1 || lockedSession.length !== 1) return { kind: 'qr_revoked' };

    const [kiosk, session] = await Promise.all([
      tx.venueKiosk.findFirst({
        where: {
          id: qr.kioskId,
          company_id: qr.companyId,
          status: 'active',
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      }),
      tx.kioskActiveSession.findFirst({
        where: {
          id: qr.kioskSessionId,
          kiosk_id: qr.kioskId,
          order_id: qr.orderId,
          company_id: qr.companyId,
          status: 'active',
          revoked_at: null,
          deleted_at: null,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { id: true },
      }),
    ]);
    if (!kiosk || !session) return { kind: 'qr_revoked' };
  } else if (qr.kioskSessionId) {
    const lockedSession = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "kiosk_sessions"
      WHERE id = ${qr.kioskSessionId}
      FOR UPDATE
    `;
    if (lockedSession.length !== 1) return { kind: 'qr_revoked' };
    const session = await tx.kioskSession.findFirst({
      where: {
        id: qr.kioskSessionId,
        assignment_id: input.assignmentId,
        order_id: qr.orderId,
        company_id: qr.companyId,
        revoked_at: null,
        deleted_at: null,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!session) return { kind: 'qr_revoked' };
  }

  const lockedGrant = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "attendance_qr_tokens"
    WHERE token_hash = ${qr.tokenHash}
    FOR UPDATE
  `;
  if (lockedGrant.length !== 1) return { kind: 'qr_invalid' };

  const grant = await tx.attendanceQrToken.findUnique({
    where: { token_hash: qr.tokenHash },
  });
  if (!grant || grant.deleted_at !== null) return { kind: 'qr_invalid' };
  if (grant.revoked_at !== null) return { kind: 'qr_revoked' };
  if (grant.expires_at.getTime() <= Date.now()) return { kind: 'qr_expired' };
  if (
    grant.nonce !== qr.nonce ||
    grant.order_id !== qr.orderId ||
    grant.company_id !== qr.companyId ||
    grant.assignment_id !== (qr.assignmentId ?? null) ||
    grant.kiosk_id !== (qr.kioskId ?? null) ||
    grant.kiosk_session_id !== (qr.kioskSessionId ?? null) ||
    (qr.assignmentId !== undefined && qr.assignmentId !== input.assignmentId)
  ) {
    return { kind: 'qr_invalid' };
  }

  try {
    await tx.attendanceQrUse.create({
      data: {
        qr_token_id: grant.id,
        worker_id: input.workerId,
        assignment_id: input.assignmentId,
        action: input.action,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { kind: 'qr_replayed' };
    throw error;
  }
  return { kind: 'consumed' };
}

export function findAttendanceById(id: string) {
  return prisma.attendanceLog.findFirst({
    where: { id, deleted_at: null },
    include: attendanceInclude,
  });
}

export function findAttendanceByIdForCompany(id: string, companyId: string) {
  return prisma.attendanceLog.findFirst({
    where: {
      id,
      deleted_at: null,
      assignment: { order: { company_id: companyId, deleted_at: null } },
    },
    include: attendanceInclude,
  });
}

export function findAttendanceByIdForWorker(id: string, workerId: string) {
  return prisma.attendanceLog.findFirst({
    where: {
      id,
      deleted_at: null,
      assignment: {
        worker_id: workerId,
        deleted_at: null,
        order: { deleted_at: null },
      },
    },
    include: attendanceInclude,
  });
}

export async function listAttendance(input: {
  where: Prisma.AttendanceLogWhereInput;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}) {
  const [total, data] = await prisma.$transaction([
    prisma.attendanceLog.count({ where: input.where }),
    prisma.attendanceLog.findMany({
      where: input.where,
      include: attendanceInclude,
      orderBy: { created_at: input.sort },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return { total, data };
}

export function createCheckInWithAudit(input: {
  assignmentId: string;
  workerId: string;
  actorId: string;
  actorRole: Role;
  qr: AttendanceQrContext;
  location?: unknown;
  notes?: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const candidate = await tx.assignment.findFirst({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        deleted_at: null,
      },
      select: { order_id: true },
    });
    if (!candidate) return { kind: 'assignment_not_accepted' as const };

    // Every lifecycle path locks parent order first, then assignment. This keeps
    // check-in serialized with both whole-order and direct-assignment cancellation
    // without introducing an assignment -> order deadlock.
    await tx.$queryRaw`
      SELECT id
      FROM "orders"
      WHERE id = ${candidate.order_id}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id
      FROM "assignments"
      WHERE id = ${input.assignmentId}
      FOR UPDATE
    `;

    const assignment = await tx.assignment.findFirst({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        status: 'accepted',
        deleted_at: null,
      },
      select: {
        id: true,
        worker_id: true,
        order_id: true,
        order: { select: { id: true, status: true, deleted_at: true } },
      },
    });

    if (
      !assignment ||
      !ORDER_ATTENDANCE_STATUSES.includes(assignment.order.status as OrderStatus) ||
      assignment.order.deleted_at !== null
    ) {
      return { kind: 'assignment_not_accepted' as const };
    }

    const existingSession = await tx.attendanceLog.findFirst({
      where: { assignment_id: input.assignmentId, deleted_at: null },
      select: { id: true, checkout_time: true },
      orderBy: { created_at: 'desc' },
    });
    if (existingSession) {
      return existingSession.checkout_time
        ? { kind: 'already_completed' as const }
        : { kind: 'already_checked_in' as const };
    }

    const qrResult = await consumeAttendanceQrToken(tx, {
      qr: input.qr,
      assignmentId: assignment.id,
      workerId: input.workerId,
      action: 'checkin',
    });
    if (qrResult.kind !== 'consumed') return qrResult;

    try {
      const attendance = await tx.attendanceLog.create({
        data: {
          assignment_id: input.assignmentId,
          checkin_time: new Date(),
          checkin_location: input.location ?? undefined,
          checkin_notes: input.notes,
          qr_token_hash: input.qr.tokenHash,
        },
        include: attendanceInclude,
      });

      await tx.auditLog.create({
        data: {
          actor_id: input.actorId,
          actor_role: input.actorRole,
          action: 'attendance_checked_in',
          entity_type: 'attendance_log',
          entity_id: attendance.id,
          metadata: {
            assignment_id: input.assignmentId,
            order_id: assignment.order_id,
            worker_id: input.workerId,
          },
        },
      });

      await markOrderInProgress(tx, assignment.order_id, {
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: 'attendance_checked_in',
      });

      const refreshedAttendance = await tx.attendanceLog.findFirst({
        where: { id: attendance.id, deleted_at: null },
        include: attendanceInclude,
      });
      if (!refreshedAttendance) throw new Error('Created attendance record could not be reloaded.');

      return { kind: 'checked_in' as const, attendance: refreshedAttendance };

      /*
      await tx.notification.create({
        data: {
          recipient_id: attendance.assignment.order.company.user.id,
          type: 'system',
          title: 'İşçi giriş etdi',
          body: `${attendance.assignment.worker.user.name} "${attendance.assignment.order.title}" üzrə giriş etdi.`,
          metadata: {
            attendance_id: attendance.id,
            assignment_id: input.assignmentId,
            order_id: assignment.order_id,
            worker_id: input.workerId,
          },
        },
      });

      return { kind: 'checked_in' as const, attendance };
      */
    } catch (error) {
      if (isUniqueConstraintError(error)) return { kind: 'already_checked_in' as const };
      throw error;
    }
  });
}

export function checkOutWithAudit(input: {
  assignmentId: string;
  workerId: string;
  actorId: string;
  actorRole: Role;
  qr: AttendanceQrContext;
  location?: unknown;
  notes?: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const candidate = await tx.assignment.findFirst({
      where: { id: input.assignmentId, worker_id: input.workerId, deleted_at: null },
      select: { order_id: true },
    });
    if (!candidate) return { kind: 'assignment_not_accepted' as const };
    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${candidate.order_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "assignments" WHERE id = ${input.assignmentId} FOR UPDATE`;

    const openLog = await tx.attendanceLog.findFirst({
      where: {
        assignment_id: input.assignmentId,
        checkout_time: null,
        deleted_at: null,
        assignment: {
          worker_id: input.workerId,
          status: 'accepted',
          deleted_at: null,
          order: { status: { in: ORDER_ATTENDANCE_STATUSES }, deleted_at: null },
        },
      },
      select: {
        id: true,
        checkin_time: true,
        assignment: { select: { order_id: true, worker_id: true } },
      },
    });

    if (!openLog) {
      const assignment = await tx.assignment.findFirst({
        where: { id: input.assignmentId, worker_id: input.workerId },
        select: {
          status: true,
          deleted_at: true,
          order: { select: { status: true, deleted_at: true } },
        },
      });
      if (isAssignmentBlockedForAttendance(assignment)) {
        return { kind: 'assignment_not_accepted' as const };
      }
      return { kind: 'not_checked_in' as const };
    }

    const qrResult = await consumeAttendanceQrToken(tx, {
      qr: input.qr,
      assignmentId: input.assignmentId,
      workerId: input.workerId,
      action: 'checkout',
    });
    if (qrResult.kind !== 'consumed') return qrResult;

    const updateResult = await tx.attendanceLog.updateMany({
      where: {
        id: openLog.id,
        checkout_time: null,
        deleted_at: null,
        assignment: {
          worker_id: input.workerId,
          status: 'accepted',
          deleted_at: null,
          order: { status: { in: ORDER_ATTENDANCE_STATUSES }, deleted_at: null },
        },
      },
      data: {
        checkout_time: new Date(),
        checkout_location: input.location ?? undefined,
        checkout_notes: input.notes,
      },
    });

    if (updateResult.count !== 1) {
      const assignment = await tx.assignment.findFirst({
        where: { id: input.assignmentId, worker_id: input.workerId },
        select: {
          status: true,
          deleted_at: true,
          order: { select: { status: true, deleted_at: true } },
        },
      });
      if (isAssignmentBlockedForAttendance(assignment)) {
        return { kind: 'assignment_not_accepted' as const };
      }
      return { kind: 'not_checked_in' as const };
    }

    const assignmentUpdate = await tx.assignment.updateMany({
      where: {
        id: input.assignmentId,
        worker_id: input.workerId,
        status: 'accepted',
        deleted_at: null,
      },
      data: { status: 'completed' },
    });
    if (assignmentUpdate.count !== 1) {
      return { kind: 'assignment_not_accepted' as const };
    }

    const attendance = await tx.attendanceLog.findFirst({
      where: { id: openLog.id },
      include: attendanceInclude,
    });
    if (!attendance) return { kind: 'not_checked_in' as const };

    await tx.auditLog.create({
      data: {
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: 'attendance_checked_out',
        entity_type: 'attendance_log',
        entity_id: attendance.id,
        metadata: {
          assignment_id: input.assignmentId,
          order_id: openLog.assignment.order_id,
          worker_id: input.workerId,
          duration_minutes: calculateDurationMinutes(attendance.checkin_time, attendance.checkout_time),
        },
      },
    });

    await completeOrderWhenFinished(tx, openLog.assignment.order_id, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: 'attendance_checked_out',
    });
    const refreshedAttendance = await tx.attendanceLog.findFirst({
      where: { id: attendance.id, deleted_at: null },
      include: attendanceInclude,
    });
    if (!refreshedAttendance) return { kind: 'not_checked_in' as const };

    return { kind: 'checked_out' as const, attendance: refreshedAttendance };

    /*
    await tx.notification.create({
      data: {
        recipient_id: attendance.assignment.order.company.user.id,
        type: 'system',
        title: 'İşçi çıxış etdi',
        body: `${attendance.assignment.worker.user.name} "${attendance.assignment.order.title}" üzrə çıxış etdi.`,
        metadata: {
          attendance_id: attendance.id,
          assignment_id: input.assignmentId,
          order_id: openLog.assignment.order_id,
          worker_id: input.workerId,
          duration_minutes: calculateDurationMinutes(attendance.checkin_time, attendance.checkout_time),
        },
      },
    });

    return { kind: 'checked_out' as const, attendance };
    */
  });
}

export function createAttendanceNotification(
  attendance: AttendanceWithRelations,
  event: 'checked_in' | 'checked_out'
) {
  const checkedIn = event === 'checked_in';
  const durationMinutes = calculateDurationMinutes(attendance.checkin_time, attendance.checkout_time);

  return prisma.notification.create({
    data: {
      recipient_id: attendance.assignment.order.company.user.id,
      type: 'system',
      title: checkedIn ? 'İşçi giriş etdi' : 'İşçi çıxış etdi',
      body: `${attendance.assignment.worker.user.name} "${attendance.assignment.order.title}" üzrə ${checkedIn ? 'giriş' : 'çıxış'} etdi.`,
      metadata: {
        attendance_id: attendance.id,
        assignment_id: attendance.assignment_id,
        order_id: attendance.assignment.order_id,
        worker_id: attendance.assignment.worker_id,
        ...(checkedIn ? {} : { duration_minutes: durationMinutes }),
      },
    },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isAssignmentBlockedForAttendance(
  assignment: {
    status: string;
    deleted_at: Date | null;
    order: { status: string; deleted_at: Date | null };
  } | null
): boolean {
  return (
    !assignment ||
    assignment.status !== 'accepted' ||
    assignment.deleted_at !== null ||
    !ORDER_ATTENDANCE_STATUSES.includes(assignment.order.status as OrderStatus) ||
    assignment.order.deleted_at !== null
  );
}

function calculateDurationMinutes(checkinTime: Date | null, checkoutTime: Date | null): number | null {
  if (!checkinTime || !checkoutTime) return null;
  return Math.max(0, Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 60000));
}
