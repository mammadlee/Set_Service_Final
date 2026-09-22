import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { normalizePermissions } from '../admins/admins.permissions';
import {
  CreateReportInput,
  ListReportsInput,
  UpdateReportInput,
} from './moderation.schema';

type ReporterRole = 'worker' | 'company';
type AdminRole = 'admin' | 'super_admin';

const VISIBLE_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'completed'] as const;

export async function createReport(
  reporterUserId: string,
  reporterRole: ReporterRole,
  input: CreateReportInput,
) {
  await assertTargetVisible(reporterUserId, reporterRole, input);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const report = await tx.moderationReport.create({
      data: {
        reporter_user_id: reporterUserId,
        reporter_role: reporterRole,
        target_type: input.target_type,
        target_id: input.target_id,
        reason: input.reason,
        details: input.details || null,
      },
      select: { id: true, status: true },
    });

    const admins = await tx.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        is_active: true,
        deleted_at: null,
      },
      select: { id: true, role: true, admin: { select: { permissions: true } } },
    });
    const recipients = admins.filter((admin) => admin.role === 'super_admin'
      || normalizePermissions(admin.admin?.permissions).includes('view_moderation'));

    if (recipients.length > 0) {
      await tx.notification.createMany({
        data: recipients.map((admin) => ({
          recipient_id: admin.id,
          type: 'system',
          channel: 'in_app',
          title: 'Yeni məzmun şikayəti',
          body: 'SET Service-də yeni istifadəçi şikayəti daxil olub.',
          metadata: { report_id: report.id },
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actor_id: reporterUserId,
        actor_role: reporterRole,
        action: 'status_changed',
        entity_type: 'moderation_report',
        entity_id: report.id,
        metadata: {
          event: 'created',
          target_type: input.target_type,
          target_id: input.target_id,
          reason: input.reason,
        },
      },
    });

    return report;
  });
}

export async function listModerationReports(input: ListReportsInput) {
  const where: Prisma.ModerationReportWhereInput = input.status
    ? { status: input.status }
    : {};
  const [total, reports] = await prisma.$transaction([
    prisma.moderationReport.count({ where }),
    prisma.moderationReport.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return {
    data: reports.map(reportResponse),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      total_pages: Math.ceil(total / input.limit),
    },
  };
}

export async function getModerationReport(id: string) {
  const report = await prisma.moderationReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, name: true, role: true } },
    },
  });
  if (!report) throw Errors.notFound('Şikayət tapılmadı.', 'MODERATION_REPORT_NOT_FOUND');

  return {
    ...reportResponse(report),
    reporter: report.reporter,
    target: await resolveTarget(report.target_type, report.target_id),
  };
}

export async function updateModerationReport(
  id: string,
  actor: { sub: string; role: AdminRole },
  input: UpdateReportInput,
) {
  const fromStatuses = input.status === 'reviewing'
    ? ['open'] as const
    : ['open', 'reviewing'] as const;
  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.moderationReport.updateMany({
      where: { id, status: { in: [...fromStatuses] } },
      data: {
        status: input.status,
        reviewed_by_id: actor.sub,
        reviewed_at: now,
        ...(input.resolution_note !== undefined
          ? { resolution_note: input.resolution_note || null }
          : {}),
      },
    });
    if (changed.count !== 1) {
      const existing = await tx.moderationReport.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) throw Errors.notFound('Şikayət tapılmadı.', 'MODERATION_REPORT_NOT_FOUND');
      throw Errors.conflict('Şikayətin vəziyyəti artıq dəyişib.', 'MODERATION_STATUS_CONFLICT', {
        status: existing.status,
      });
    }

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role,
        action: 'status_changed',
        entity_type: 'moderation_report',
        entity_id: id,
        metadata: { event: 'reviewed', new_status: input.status },
      },
    });
  });

  return getModerationReport(id);
}

export async function assertTargetVisible(
  reporterUserId: string,
  reporterRole: ReporterRole,
  input: CreateReportInput,
): Promise<void> {
  if (reporterRole === 'worker') {
    if (input.target_type === 'order' || input.target_type === 'company_profile') {
      const assignment = await prisma.assignment.findFirst({
        where: {
          status: { in: [...VISIBLE_ASSIGNMENT_STATUSES] },
          deleted_at: null,
          worker: { user_id: reporterUserId, deleted_at: null },
          order: {
            deleted_at: null,
            ...(input.target_type === 'order'
              ? { id: input.target_id }
              : { company_id: input.target_id }),
          },
        },
        select: { id: true },
      });
      if (assignment) return;
    }

    if (input.target_type === 'rating') {
      const rating = await prisma.rating.findFirst({
        where: {
          id: input.target_id,
          deleted_at: null,
          worker: { user_id: reporterUserId, deleted_at: null },
        },
        select: { id: true },
      });
      if (rating) return;
    }
  }

  if (reporterRole === 'company' && input.target_type === 'worker_profile') {
    const assignment = await prisma.assignment.findFirst({
      where: {
        worker_id: input.target_id,
        status: { in: [...VISIBLE_ASSIGNMENT_STATUSES] },
        deleted_at: null,
        worker: { deleted_at: null },
        order: {
          deleted_at: null,
          company: { user_id: reporterUserId, status: 'approved', deleted_at: null },
        },
      },
      select: { id: true },
    });
    if (assignment) return;
  }

  throw Errors.forbidden(
    'Bu məzmunu şikayət etmək üçün giriş icazəniz yoxdur.',
    'REPORT_TARGET_FORBIDDEN',
  );
}

function reportResponse(report: {
  id: string;
  reporter_role: Role;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  reviewed_by_id: string | null;
  reviewed_at: Date | null;
  resolution_note: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: report.id,
    reporter_role: report.reporter_role,
    target_type: report.target_type,
    target_id: report.target_id,
    reason: report.reason,
    details: report.details,
    status: report.status,
    reviewed_by_id: report.reviewed_by_id,
    reviewed_at: report.reviewed_at,
    resolution_note: report.resolution_note,
    created_at: report.created_at,
    updated_at: report.updated_at,
  };
}

async function resolveTarget(type: string, id: string) {
  if (type === 'order') {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { title: true },
    });
    return { id, type, label: order?.title ?? 'Silinmiş sifariş' };
  }
  if (type === 'company_profile') {
    const company = await prisma.company.findUnique({
      where: { id },
      select: { name: true },
    });
    return { id, type, label: company?.name ?? 'Silinmiş müəssisə' };
  }
  if (type === 'worker_profile') {
    const worker = await prisma.worker.findUnique({
      where: { id },
      select: { user: { select: { name: true } } },
    });
    return { id, type, label: worker?.user.name ?? 'Silinmiş işçi' };
  }
  const rating = await prisma.rating.findUnique({
    where: { id },
    select: { score: true, comment: true },
  });
  return {
    id,
    type,
    label: rating ? `${rating.score} ulduz` : 'Silinmiş reytinq',
    ...(rating ? { comment: rating.comment } : {}),
  };
}
