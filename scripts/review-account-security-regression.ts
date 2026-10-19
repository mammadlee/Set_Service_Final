import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {
  STORE_REVIEW_ADMIN_PERMISSIONS,
  StoreReviewAccountConfig,
} from '../src/lib/store-review-accounts';
import {
  ReviewAccountRecord,
  ReviewAccountSnapshot,
  validateStoreReviewAccounts,
} from './review-account-readiness';
import {
  STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS,
  STORE_REVIEW_ACTIVE_ORDER_TITLE,
  STORE_REVIEW_COMPLETED_ORDER_TITLE,
} from './provision-store-review';

const config: StoreReviewAccountConfig = {
  identifiers: {
    workerPhone: '+994501112233',
    companyPhone: '+994501112244',
    companyEmail: 'store-review-company@example.invalid',
    adminPhone: '+994501112255',
    adminEmail: 'store-review-admin@example.invalid',
  },
  passwords: {
    worker: 'Worker-Review-Password-42!',
    company: 'Company-Review-Password-43!',
    admin: 'Admin-Review-Password-44!',
  },
  adminPermissions: STORE_REVIEW_ADMIN_PERMISSIONS,
};

const now = new Date('2026-10-17T10:00:00.000Z');
const workerId = 'review-worker-profile-id';

async function userRecord(
  role: 'worker' | 'company' | 'admin',
  overrides: Partial<ReviewAccountRecord> = {},
): Promise<ReviewAccountRecord> {
  const phone = role === 'worker'
    ? config.identifiers.workerPhone
    : role === 'company'
      ? config.identifiers.companyPhone
      : config.identifiers.adminPhone;
  const email = role === 'worker'
    ? null
    : role === 'company'
      ? config.identifiers.companyEmail
      : config.identifiers.adminEmail;
  return {
    id: `${role}-user-id`,
    phone,
    email,
    pending_email: null,
    email_verified_at: email ? now : null,
    fcm_token: null,
    role,
    name: `Synthetic ${role}`,
    is_active: true,
    is_review_account: true,
    deleted_at: null,
    password_hash: await bcrypt.hash(config.passwords[role], 4),
    password_set_at: now,
    ...overrides,
  };
}

async function validSnapshot(): Promise<ReviewAccountSnapshot> {
  const reviewWorker = {
    id: workerId,
    user: { is_review_account: true },
  };
  const activeOrder = {
    id: 'active-order-id',
    title: STORE_REVIEW_ACTIVE_ORDER_TITLE,
    status: 'in_progress',
    shift_start: new Date(now.getTime() - 60 * 60 * 1000),
    shift_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    deleted_at: null,
    assignments: [{
      status: 'accepted',
      deleted_at: null,
      attendance_logs: [],
      worker: reviewWorker,
    }],
  };
  const completedOrder = {
    id: 'completed-order-id',
    title: STORE_REVIEW_COMPLETED_ORDER_TITLE,
    status: 'completed',
    shift_start: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    shift_end: new Date(now.getTime() - 64 * 60 * 60 * 1000),
    deleted_at: null,
    assignments: [{
      status: 'completed',
      deleted_at: null,
      attendance_logs: [{
        checkin_time: new Date(now.getTime() - 72 * 60 * 60 * 1000),
        checkout_time: new Date(now.getTime() - 64 * 60 * 60 * 1000),
        deleted_at: null,
      }],
      worker: reviewWorker,
    }],
  };

  return {
    worker: await userRecord('worker', {
      worker: {
        id: workerId,
        status: 'approved',
        position: 'Event Service Worker',
        profile_photo_url: 'https://assets.example.invalid/store-review/avatar.webp',
        skills: [{ name: 'Guest service', level: 4 }],
        languages: ['English'],
        documents: [
          {
            type: 'health_certificate',
            key: `workers/${workerId}/documents/health_certificate/synthetic.pdf`,
            status: 'ready',
            scan_status: 'clean',
          },
          {
            type: 'criminal_record',
            key: `workers/${workerId}/documents/criminal_record/synthetic.pdf`,
            status: 'ready',
            scan_status: 'clean',
          },
        ],
        work_history_summary: 'Synthetic experience.',
        work_history: [{ company_name: 'Synthetic Venue', position: 'Worker' }],
        deleted_at: null,
        assignments: [activeOrder, completedOrder].map((order) => ({
          deleted_at: null,
          order: { company: { user: { is_review_account: true } } },
        })),
      },
    }),
    company: await userRecord('company', {
      company: {
        id: 'review-company-profile-id',
        name: 'Store Review Demo Company',
        status: 'approved',
        deleted_at: null,
        orders: [activeOrder, completedOrder],
      },
    }),
    admin: await userRecord('admin', {
      admin: { permissions: [...STORE_REVIEW_ADMIN_PERMISSIONS] },
    }),
    notificationCounts: { worker: 2, company: 1, admin: 1 },
    reviewAccountCount: 3,
    reviewOrderOutboxCount: 0,
    activeReviewerDeviceTokenCount: 0,
    pendingReviewerProviderEventCount: 0,
    reviewIdentifierCollisionCount: 0,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function expectCode(
  mutate: (snapshot: ReviewAccountSnapshot) => void,
  code: string,
): Promise<void> {
  const snapshot = clone(await validSnapshot());
  mutate(snapshot);
  await assert.rejects(
    () => validateStoreReviewAccounts(snapshot, config, now),
    (error: unknown) => error instanceof Error && error.message === code,
  );
}

async function main(): Promise<void> {
  const summary = await validateStoreReviewAccounts(await validSnapshot(), config, now);
  assert.equal(summary.accountCount, 3);
  assert.equal(summary.fixtureOrderCount, 2);
  assert.equal(summary.closedAttendanceCount, 1);
  assert.equal(summary.readyPrivateDocumentCount, 2);

  await expectCode((snapshot) => {
    snapshot.admin!.is_review_account = false;
  }, 'STORE_REVIEW_SCOPE_MISSING:admin');
  await expectCode((snapshot) => {
    snapshot.reviewAccountCount = 4;
  }, 'STORE_REVIEW_ACCOUNT_SCOPE_COUNT_INVALID');
  await expectCode((snapshot) => {
    snapshot.reviewIdentifierCollisionCount = 1;
  }, 'STORE_REVIEW_IDENTIFIER_COLLISION');
  await expectCode((snapshot) => {
    snapshot.admin!.admin!.permissions = ['*'];
  }, 'STORE_REVIEW_ADMIN_WILDCARD_FORBIDDEN');
  await expectCode((snapshot) => {
    snapshot.worker!.worker!.documents = [];
  }, 'STORE_REVIEW_PRIVATE_DOCUMENTS_NOT_READY');
  await expectCode((snapshot) => {
    snapshot.worker!.worker!.profile_photo_url = '';
  }, 'STORE_REVIEW_PROFILE_PHOTO_MISSING');
  await expectCode((snapshot) => {
    snapshot.worker!.worker!.assignments[0].order.company.user.is_review_account = false;
  }, 'STORE_REVIEW_WORKER_ASSIGNMENT_SCOPE_INVALID');
  await expectCode((snapshot) => {
    snapshot.company!.company!.orders[0].assignments[0].worker.user.is_review_account = false;
  }, 'STORE_REVIEW_COMPANY_ASSIGNMENT_SCOPE_INVALID');
  await expectCode((snapshot) => {
    snapshot.reviewOrderOutboxCount = 1;
  }, 'STORE_REVIEW_EXTERNAL_OUTBOX_FORBIDDEN');
  await expectCode((snapshot) => {
    snapshot.activeReviewerDeviceTokenCount = 1;
  }, 'STORE_REVIEW_ACTIVE_DEVICE_TOKEN_FORBIDDEN');
  await expectCode((snapshot) => {
    snapshot.pendingReviewerProviderEventCount = 1;
  }, 'STORE_REVIEW_PENDING_PROVIDER_EVENT_FORBIDDEN');
  await expectCode((snapshot) => {
    snapshot.worker!.fcm_token = 'legacy-review-token';
  }, 'STORE_REVIEW_LEGACY_FCM_TOKEN_ACTIVE:worker');
  await expectCode((snapshot) => {
    snapshot.company!.email_verified_at = null;
  }, 'STORE_REVIEW_EMAIL_NOT_VERIFIED:company');
  await expectCode((snapshot) => {
    snapshot.company!.pending_email = 'pending-collision@example.invalid';
  }, 'STORE_REVIEW_PENDING_EMAIL_INVALID:company');
  await expectCode((snapshot) => {
    snapshot.company!.company!.orders[0].shift_end = new Date(now.getTime() - 1);
  }, 'STORE_REVIEW_ACTIVE_ORDER_WINDOW_INVALID');
  await expectCode((snapshot) => {
    snapshot.company!.company!.orders[0].shift_end = new Date(
      now.getTime() + STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000 - 1,
    );
  }, 'STORE_REVIEW_ACTIVE_ORDER_REVIEW_WINDOW_TOO_SHORT');
  await expectCode((snapshot) => {
    snapshot.notificationCounts.worker = 0;
  }, 'STORE_REVIEW_WORKER_NOTIFICATION_MISSING');

  const wrongPassword = await validSnapshot();
  wrongPassword.worker!.password_hash = await bcrypt.hash('Wrong-Worker-Password-99!', 4);
  await assert.rejects(
    () => validateStoreReviewAccounts(wrongPassword, config, now),
    (error: unknown) => error instanceof Error
      && error.message === 'STORE_REVIEW_PASSWORD_MISMATCH:worker',
  );

  console.log('review-account-security-regression: OK');
}

void main();
