import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  decryptProviderPayload,
  resolveProviderRecipientOwners,
} from '../src/lib/provider-outbox';
import { isStoreReviewAccount } from '../src/lib/review-delivery-policy';
import {
  STORE_REVIEW_ADMIN_PERMISSIONS,
  StoreReviewAccountConfig,
  resolveStoreReviewAccountConfig,
} from '../src/lib/store-review-accounts';
import {
  STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS,
  STORE_REVIEW_ACTIVE_ORDER_TITLE,
  STORE_REVIEW_COMPLETED_ORDER_TITLE,
} from './provision-store-review';

type ReviewDocument = {
  type?: unknown;
  key?: unknown;
  status?: unknown;
  scan_status?: unknown;
  deleted_at?: unknown;
};

type ReviewAttendance = {
  checkin_time: Date | null;
  checkout_time: Date | null;
  deleted_at: Date | null;
};

type ReviewAssignment = {
  status: string;
  deleted_at: Date | null;
  attendance_logs: ReviewAttendance[];
  worker: {
    id: string;
    user: { is_review_account: boolean };
  };
};

type ReviewOrder = {
  id: string;
  title: string;
  status: string;
  shift_start: Date;
  shift_end: Date;
  deleted_at: Date | null;
  assignments: ReviewAssignment[];
};

export type ReviewAccountRecord = {
  id: string;
  phone: string;
  email: string | null;
  pending_email: string | null;
  email_verified_at: Date | null;
  fcm_token: string | null;
  role: string;
  name: string;
  is_active: boolean;
  is_review_account: boolean;
  deleted_at: Date | null;
  password_hash: string | null;
  password_set_at: Date | null;
  worker?: {
    id: string;
    status: string;
    position: string | null;
    profile_photo_url: string | null;
    skills: unknown;
    languages: unknown;
    documents: unknown;
    work_history_summary: string | null;
    work_history: unknown;
    deleted_at: Date | null;
    assignments: Array<{
      deleted_at: Date | null;
      order: { company: { user: { is_review_account: boolean } } };
    }>;
  } | null;
  company?: {
    id: string;
    name: string;
    status: string;
    deleted_at: Date | null;
    orders: ReviewOrder[];
  } | null;
  admin?: { permissions: unknown } | null;
};

export type ReviewAccountSnapshot = {
  worker: ReviewAccountRecord | null;
  company: ReviewAccountRecord | null;
  admin: ReviewAccountRecord | null;
  notificationCounts: { worker: number; company: number; admin: number };
  reviewAccountCount: number;
  reviewOrderOutboxCount: number;
  activeReviewerDeviceTokenCount: number;
  pendingReviewerProviderEventCount: number;
  reviewIdentifierCollisionCount: number;
};

export type ReviewReadinessSummary = {
  accountCount: number;
  fixtureOrderCount: number;
  fixtureAssignmentCount: number;
  closedAttendanceCount: number;
  readyPrivateDocumentCount: number;
  notificationCount: number;
};

export function requireReady(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

async function verifyPassword(
  account: ReviewAccountRecord,
  password: string,
  role: string,
): Promise<void> {
  requireReady(account.password_hash, `STORE_REVIEW_PASSWORD_MISSING:${role}`);
  requireReady(account.password_set_at, `STORE_REVIEW_PASSWORD_SET_AT_MISSING:${role}`);
  requireReady(
    await bcrypt.compare(password, account.password_hash),
    `STORE_REVIEW_PASSWORD_MISMATCH:${role}`,
  );
}

function verifyAdminAllowlist(account: ReviewAccountRecord): void {
  const permissions = account.admin?.permissions;
  requireReady(Array.isArray(permissions), 'STORE_REVIEW_ADMIN_PERMISSIONS_INVALID');
  requireReady(
    permissions.every((permission): permission is string => typeof permission === 'string'),
    'STORE_REVIEW_ADMIN_PERMISSIONS_INVALID',
  );
  const actual = permissions as string[];
  requireReady(!actual.includes('*'), 'STORE_REVIEW_ADMIN_WILDCARD_FORBIDDEN');
  requireReady(!actual.includes('manage_admins'), 'STORE_REVIEW_ADMIN_MANAGEMENT_FORBIDDEN');
  const actualSet = new Set(actual);
  requireReady(actualSet.size === actual.length, 'STORE_REVIEW_ADMIN_PERMISSIONS_DUPLICATE');
  requireReady(
    actual.length === STORE_REVIEW_ADMIN_PERMISSIONS.length
      && STORE_REVIEW_ADMIN_PERMISSIONS.every((permission) => actualSet.has(permission)),
    'STORE_REVIEW_ADMIN_PERMISSION_ALLOWLIST_MISMATCH',
  );
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function readyPrivateDocumentCount(worker: NonNullable<ReviewAccountRecord['worker']>): number {
  if (!Array.isArray(worker.documents)) return 0;
  const requiredTypes = new Set(['health_certificate', 'criminal_record']);
  for (const value of worker.documents) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const document = value as ReviewDocument;
    if (
      typeof document.type === 'string'
      && requiredTypes.has(document.type)
      && typeof document.key === 'string'
      && document.key.startsWith(`workers/${worker.id}/documents/${document.type}/`)
      && document.status === 'ready'
      && document.scan_status === 'clean'
      && !document.deleted_at
    ) {
      requiredTypes.delete(document.type);
    }
  }
  return 2 - requiredTypes.size;
}

function exactAccountIdentity(
  account: ReviewAccountRecord,
  input: { phone: string; email: string | null; role: string },
  role: string,
): void {
  requireReady(account.phone === input.phone, `STORE_REVIEW_PHONE_INVALID:${role}`);
  requireReady(account.email === input.email, `STORE_REVIEW_EMAIL_INVALID:${role}`);
  requireReady(account.pending_email === null, `STORE_REVIEW_PENDING_EMAIL_INVALID:${role}`);
  requireReady(account.role === input.role, `STORE_REVIEW_ROLE_INVALID:${role}`);
  requireReady(account.is_active && !account.deleted_at, `STORE_REVIEW_INACTIVE:${role}`);
  requireReady(account.is_review_account, `STORE_REVIEW_SCOPE_MISSING:${role}`);
  requireReady(account.fcm_token === null, `STORE_REVIEW_LEGACY_FCM_TOKEN_ACTIVE:${role}`);
  if (input.email) {
    requireReady(account.email_verified_at, `STORE_REVIEW_EMAIL_NOT_VERIFIED:${role}`);
  }
}

export async function validateStoreReviewAccounts(
  snapshot: ReviewAccountSnapshot,
  config: StoreReviewAccountConfig,
  now = new Date(),
): Promise<ReviewReadinessSummary> {
  const workerAccount = snapshot.worker;
  requireReady(workerAccount, 'STORE_REVIEW_WORKER_NOT_FOUND');
  exactAccountIdentity(workerAccount, {
    phone: config.identifiers.workerPhone,
    email: null,
    role: 'worker',
  }, 'worker');
  await verifyPassword(workerAccount, config.passwords.worker, 'worker');
  const worker = workerAccount.worker;
  requireReady(worker && !worker.deleted_at, 'STORE_REVIEW_WORKER_PROFILE_INVALID');
  requireReady(worker.status === 'approved', 'STORE_REVIEW_WORKER_NOT_APPROVED');
  requireReady(Boolean(worker.position?.trim()), 'STORE_REVIEW_WORKER_POSITION_MISSING');
  requireReady(isNonEmptyArray(worker.skills), 'STORE_REVIEW_WORKER_SKILLS_MISSING');
  requireReady(isNonEmptyArray(worker.languages), 'STORE_REVIEW_WORKER_LANGUAGES_MISSING');
  requireReady(Boolean(worker.work_history_summary?.trim()), 'STORE_REVIEW_WORK_HISTORY_MISSING');
  requireReady(isNonEmptyArray(worker.work_history), 'STORE_REVIEW_WORK_HISTORY_MISSING');
  requireReady(Boolean(worker.profile_photo_url?.trim()), 'STORE_REVIEW_PROFILE_PHOTO_MISSING');
  requireReady(
    worker.assignments.every((assignment) =>
      !assignment.deleted_at && assignment.order.company.user.is_review_account),
    'STORE_REVIEW_WORKER_ASSIGNMENT_SCOPE_INVALID',
  );

  const documentsReady = readyPrivateDocumentCount(worker);
  requireReady(documentsReady === 2, 'STORE_REVIEW_PRIVATE_DOCUMENTS_NOT_READY');

  const companyAccount = snapshot.company;
  requireReady(companyAccount, 'STORE_REVIEW_COMPANY_NOT_FOUND');
  exactAccountIdentity(companyAccount, {
    phone: config.identifiers.companyPhone,
    email: config.identifiers.companyEmail,
    role: 'company',
  }, 'company');
  await verifyPassword(companyAccount, config.passwords.company, 'company');
  const company = companyAccount.company;
  requireReady(company && !company.deleted_at, 'STORE_REVIEW_COMPANY_PROFILE_INVALID');
  requireReady(company.status === 'approved', 'STORE_REVIEW_COMPANY_NOT_APPROVED');
  requireReady(Boolean(company.name.trim()), 'STORE_REVIEW_COMPANY_NAME_MISSING');
  requireReady(
    company.orders.every((order) => order.assignments.every((assignment) =>
      !assignment.deleted_at && assignment.worker.user.is_review_account)),
    'STORE_REVIEW_COMPANY_ASSIGNMENT_SCOPE_INVALID',
  );

  const adminAccount = snapshot.admin;
  requireReady(adminAccount, 'STORE_REVIEW_ADMIN_NOT_FOUND');
  exactAccountIdentity(adminAccount, {
    phone: config.identifiers.adminPhone,
    email: config.identifiers.adminEmail,
    role: 'admin',
  }, 'admin');
  await verifyPassword(adminAccount, config.passwords.admin, 'admin');
  requireReady(adminAccount.admin, 'STORE_REVIEW_ADMIN_PROFILE_MISSING');
  verifyAdminAllowlist(adminAccount);

  requireReady(snapshot.reviewAccountCount === 3, 'STORE_REVIEW_ACCOUNT_SCOPE_COUNT_INVALID');
  requireReady(
    snapshot.reviewIdentifierCollisionCount === 0,
    'STORE_REVIEW_IDENTIFIER_COLLISION',
  );
  requireReady(snapshot.reviewOrderOutboxCount === 0, 'STORE_REVIEW_EXTERNAL_OUTBOX_FORBIDDEN');
  requireReady(
    snapshot.activeReviewerDeviceTokenCount === 0,
    'STORE_REVIEW_ACTIVE_DEVICE_TOKEN_FORBIDDEN',
  );
  requireReady(
    snapshot.pendingReviewerProviderEventCount === 0,
    'STORE_REVIEW_PENDING_PROVIDER_EVENT_FORBIDDEN',
  );
  requireReady(snapshot.notificationCounts.worker > 0, 'STORE_REVIEW_WORKER_NOTIFICATION_MISSING');
  requireReady(snapshot.notificationCounts.company > 0, 'STORE_REVIEW_COMPANY_NOTIFICATION_MISSING');
  requireReady(snapshot.notificationCounts.admin > 0, 'STORE_REVIEW_ADMIN_NOTIFICATION_MISSING');

  const activeOrder = company.orders.find((order) =>
    order.title === STORE_REVIEW_ACTIVE_ORDER_TITLE && !order.deleted_at);
  requireReady(activeOrder, 'STORE_REVIEW_ACTIVE_ORDER_MISSING');
  requireReady(activeOrder.status === 'in_progress', 'STORE_REVIEW_ACTIVE_ORDER_STATUS_INVALID');
  requireReady(
    activeOrder.shift_start <= now && activeOrder.shift_end > now,
    'STORE_REVIEW_ACTIVE_ORDER_WINDOW_INVALID',
  );
  requireReady(
    activeOrder.shift_end.getTime() - now.getTime()
      >= STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    'STORE_REVIEW_ACTIVE_ORDER_REVIEW_WINDOW_TOO_SHORT',
  );
  requireReady(
    activeOrder.assignments.some((assignment) =>
      !assignment.deleted_at && assignment.worker.user.is_review_account),
    'STORE_REVIEW_ACTIVE_ASSIGNMENT_MISSING',
  );

  const completedOrder = company.orders.find((order) =>
    order.title === STORE_REVIEW_COMPLETED_ORDER_TITLE && !order.deleted_at);
  requireReady(completedOrder, 'STORE_REVIEW_COMPLETED_ORDER_MISSING');
  requireReady(completedOrder.status === 'completed', 'STORE_REVIEW_COMPLETED_ORDER_STATUS_INVALID');
  requireReady(completedOrder.shift_end < now, 'STORE_REVIEW_COMPLETED_ORDER_WINDOW_INVALID');
  const completedAssignment = completedOrder.assignments.find((assignment) =>
    assignment.status === 'completed'
    && !assignment.deleted_at
    && assignment.worker.user.is_review_account);
  requireReady(completedAssignment, 'STORE_REVIEW_COMPLETED_ASSIGNMENT_MISSING');
  const closedAttendance = completedAssignment.attendance_logs.filter((attendance) =>
    !attendance.deleted_at
    && attendance.checkin_time
    && attendance.checkout_time
    && attendance.checkout_time > attendance.checkin_time);
  requireReady(closedAttendance.length > 0, 'STORE_REVIEW_CLOSED_ATTENDANCE_MISSING');

  const notificationCount = snapshot.notificationCounts.worker
    + snapshot.notificationCounts.company
    + snapshot.notificationCounts.admin;
  return {
    accountCount: 3,
    fixtureOrderCount: 2,
    fixtureAssignmentCount: activeOrder.assignments.length + completedOrder.assignments.length,
    closedAttendanceCount: closedAttendance.length,
    readyPrivateDocumentCount: documentsReady,
    notificationCount,
  };
}

export async function loadReviewAccountSnapshot(
  prisma: PrismaClient,
  config: StoreReviewAccountConfig,
): Promise<ReviewAccountSnapshot> {
  const workerInclude = {
    worker: {
      include: {
        assignments: {
          where: { deleted_at: null },
          select: {
            deleted_at: true,
            order: {
              select: {
                company: { select: { user: { select: { is_review_account: true } } } },
              },
            },
          },
        },
      },
    },
  } as const;
  const companyInclude = {
    company: {
      include: {
        orders: {
          where: { deleted_at: null },
          include: {
            assignments: {
              where: { deleted_at: null },
              include: {
                attendance_logs: { where: { deleted_at: null } },
                worker: { select: { id: true, user: { select: { is_review_account: true } } } },
              },
            },
          },
        },
      },
    },
  } as const;

  const [worker, company, admin, reviewAccountCount, identifierCandidates] = await Promise.all([
    prisma.user.findUnique({
      where: { phone: config.identifiers.workerPhone },
      include: workerInclude,
    }),
    prisma.user.findUnique({
      where: { phone: config.identifiers.companyPhone },
      include: companyInclude,
    }),
    prisma.user.findUnique({
      where: { phone: config.identifiers.adminPhone },
      include: { admin: true },
    }),
    prisma.user.count({ where: { is_review_account: true, deleted_at: null } }),
    prisma.user.findMany({
      where: {
        OR: [
          { phone: { in: [
            config.identifiers.workerPhone,
            config.identifiers.companyPhone,
            config.identifiers.adminPhone,
          ] } },
          { email: { in: [config.identifiers.companyEmail, config.identifiers.adminEmail] } },
          { pending_email: { in: [config.identifiers.companyEmail, config.identifiers.adminEmail] } },
        ],
      },
      select: { id: true, phone: true, email: true, pending_email: true },
    }),
  ]);

  const exactIdentities = new Map<string, { phone: string; email: string | null }>();
  if (worker) {
    exactIdentities.set(worker.id, { phone: config.identifiers.workerPhone, email: null });
  }
  if (company) {
    exactIdentities.set(company.id, {
      phone: config.identifiers.companyPhone,
      email: config.identifiers.companyEmail,
    });
  }
  if (admin) {
    exactIdentities.set(admin.id, {
      phone: config.identifiers.adminPhone,
      email: config.identifiers.adminEmail,
    });
  }
  const reviewIdentifierCollisionCount = identifierCandidates.filter((candidate) => {
    const expected = exactIdentities.get(candidate.id);
    return !expected
      || candidate.phone !== expected.phone
      || candidate.email !== expected.email
      || candidate.pending_email !== null;
  }).length;

  const accountIds = [worker?.id, company?.id, admin?.id].filter((id): id is string => Boolean(id));
  const reviewOrderIds = company?.company?.orders.map((order) => order.id) ?? [];
  const [
    workerNotifications,
    companyNotifications,
    adminNotifications,
    reviewOrderOutboxCount,
    activeReviewerDeviceTokenCount,
    pendingReviewerProviderEventCount,
  ] = await Promise.all([
    worker ? prisma.notification.count({
      where: { recipient_id: worker.id, channel: 'in_app', deleted_at: null },
    }) : 0,
    company ? prisma.notification.count({
      where: { recipient_id: company.id, channel: 'in_app', deleted_at: null },
    }) : 0,
    admin ? prisma.notification.count({
      where: { recipient_id: admin.id, channel: 'in_app', deleted_at: null },
    }) : 0,
    reviewOrderIds.length > 0 ? prisma.outboxEvent.count({
      where: { aggregate: 'order', aggregate_id: { in: reviewOrderIds } },
    }) : 0,
    accountIds.length > 0 ? prisma.deviceToken.count({
      where: {
        user_id: { in: accountIds },
        revoked_at: null,
        deleted_at: null,
      },
    }) : 0,
    countPendingReviewerProviderEvents(prisma),
  ]);
  requireReady(accountIds.length <= 3, 'STORE_REVIEW_ACCOUNT_SNAPSHOT_INVALID');

  return {
    worker: worker as unknown as ReviewAccountRecord | null,
    company: company as unknown as ReviewAccountRecord | null,
    admin: admin as unknown as ReviewAccountRecord | null,
    notificationCounts: {
      worker: workerNotifications,
      company: companyNotifications,
      admin: adminNotifications,
    },
    reviewAccountCount,
    reviewOrderOutboxCount,
    activeReviewerDeviceTokenCount,
    pendingReviewerProviderEventCount,
    reviewIdentifierCollisionCount,
  };
}

async function countPendingReviewerProviderEvents(prisma: PrismaClient): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  while (true) {
    const events = await prisma.outboxEvent.findMany({
      where: {
        event_type: { in: ['provider.sms.send', 'provider.email.send'] },
        status: { in: ['pending', 'processing'] },
      },
      select: { id: true, payload: true },
      orderBy: { id: 'asc' },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (events.length === 0) break;
    for (const event of events) {
      const payload = decryptProviderPayload(event.payload, event.id);
      const owners = await resolveProviderRecipientOwners(payload.channel, payload.to, prisma);
      if (owners.some(isStoreReviewAccount)) count += 1;
    }
    cursor = events.at(-1)?.id;
    if (events.length < 250) break;
  }
  return count;
}

export async function runReviewAccountReadiness(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReviewReadinessSummary> {
  const config = resolveStoreReviewAccountConfig(env);
  const prisma = new PrismaClient();
  try {
    const snapshot = await loadReviewAccountSnapshot(prisma, config);
    const summary = await validateStoreReviewAccounts(snapshot, config);
    console.log('Store review account readiness passed.', {
      account_count: summary.accountCount,
      fixture_order_count: summary.fixtureOrderCount,
      fixture_assignment_count: summary.fixtureAssignmentCount,
      closed_attendance_count: summary.closedAttendanceCount,
      ready_private_document_count: summary.readyPrivateDocumentCount,
      notification_count: summary.notificationCount,
    });
    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

function safeReadinessError(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_:-]{2,160}$/.test(error.message)) {
    return error.message;
  }
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

if (require.main === module) {
  void runReviewAccountReadiness().catch((error: unknown) => {
    console.error('Store review account readiness failed.', {
      error_code: safeReadinessError(error),
    });
    process.exitCode = 1;
  });
}
