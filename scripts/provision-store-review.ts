import 'dotenv/config';

import bcrypt from 'bcryptjs';
import {
  AssignmentStatus,
  CompanyStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  PrismaClient,
  Role,
  WorkerStatus,
} from '@prisma/client';
import {
  StoreReviewAccountConfig,
  resolveStoreReviewAccountConfig,
} from '../src/lib/store-review-accounts';
import { decryptProviderPayload } from '../src/lib/provider-outbox';
import { normalizeEmail } from '../src/lib/password';
import { normalizePhone } from '../src/lib/phone';

const REVIEW_LOCK_NAME = 'set-service:store-review-provision:v1';
export const STORE_REVIEW_FIXTURE_VERSION = 'store-review-v1';
export const STORE_REVIEW_ACTIVE_ORDER_TITLE = 'Store Review Demo - Active Shift';
export const STORE_REVIEW_COMPLETED_ORDER_TITLE = 'Store Review Demo - Completed Shift';
export const STORE_REVIEW_ACTIVE_ORDER_WINDOW_DAYS = 30;
export const STORE_REVIEW_MIN_ACTIVE_WINDOW_DAYS = 14;
const BCRYPT_COST = 12;
const SERIALIZABLE_RETRY_LIMIT = 3;

type ReviewRole = 'worker' | 'company' | 'admin';

export type StoreReviewProvisionOptions = {
  apply: boolean;
  adoptExisting: boolean;
  rotatePasswords: boolean;
};

export type ReviewUserRecord = {
  id: string;
  phone: string;
  email: string | null;
  pending_email: string | null;
  password_hash: string | null;
  role: Role;
  is_active: boolean;
  is_review_account: boolean;
  deleted_at: Date | null;
  worker: {
    id: string;
    status: WorkerStatus;
    suspended_at: Date | null;
    deleted_at: Date | null;
  } | null;
  company: {
    id: string;
    status: CompanyStatus;
    suspended_at: Date | null;
    deleted_at: Date | null;
  } | null;
  admin: { id: string } | null;
};

type ReviewIdentitySpec = {
  role: ReviewRole;
  phone: string;
  email: string | null;
};

export type ClassifiedReviewAccount = {
  spec: ReviewIdentitySpec;
  existing: ReviewUserRecord | null;
  passwordMatches: boolean;
};

export type StoreReviewProvisionPlan = {
  mode: 'dry-run' | 'apply';
  accountCount: number;
  createCount: number;
  existingReviewCount: number;
  adoptionRequiredCount: number;
  passwordRotationRequiredCount: number;
  privateDocumentSetupRequired: boolean;
  profilePhotoSetupRequired: boolean;
};

type ProvisionedUsers = {
  worker: { id: string };
  company: { id: string };
  admin: { id: string };
};

type PasswordHashes = Record<ReviewRole, string>;

export type StoreReviewAdoptionFootprint = {
  relationshipCount: number;
  profileDataPresent: boolean;
};

export type StoreReviewWorkerAdoptionState = {
  position: string | null;
  profile_photo_url: string | null;
  skills: unknown;
  languages: unknown;
  documents: unknown;
  work_history_summary: string | null;
  work_history: unknown;
  gender: string | null;
  whatsapp_available: boolean;
  status: string;
  reject_reason: string | null;
  approved_at: Date | null;
  approved_by_id: string | null;
  rejected_at: Date | null;
  rejected_by_id: string | null;
  suspended_at: Date | null;
  worker_class: string | null;
  is_foc_training: boolean;
  foc_training_note: string | null;
  foc_training_updated_at: Date | null;
  foc_training_updated_by_id: string | null;
  rating_avg: number;
  rating_count: number;
  availability: boolean;
  deleted_at: Date | null;
};

class StoreReviewProvisionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StoreReviewProvisionError';
  }
}

export function parseStoreReviewProvisionArgs(args: string[]): StoreReviewProvisionOptions {
  const supported = new Set(['--apply', '--adopt-existing', '--rotate-passwords']);
  const unknown = args.filter((arg) => !supported.has(arg));
  if (unknown.length > 0) throw new StoreReviewProvisionError('STORE_REVIEW_ARGUMENT_INVALID');

  const options = {
    apply: args.includes('--apply'),
    adoptExisting: args.includes('--adopt-existing'),
    rotatePasswords: args.includes('--rotate-passwords'),
  };

  if (!options.apply && (options.adoptExisting || options.rotatePasswords)) {
    throw new StoreReviewProvisionError('STORE_REVIEW_APPLY_FLAG_REQUIRED');
  }
  return options;
}

export function assertStoreReviewProvisionAllowed(
  options: StoreReviewProvisionOptions,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!options.apply) return;
  if (env.ALLOW_PRODUCTION_REVIEW_PROVISION !== 'true') {
    throw new StoreReviewProvisionError('PRODUCTION_REVIEW_PROVISION_DISABLED');
  }
  if (env.STORE_REVIEW_OUTBOX_QUIESCED !== 'true') {
    throw new StoreReviewProvisionError('STORE_REVIEW_OUTBOX_NOT_QUIESCED');
  }
  if (options.adoptExisting && env.ALLOW_PRODUCTION_REVIEW_ADOPTION !== 'true') {
    throw new StoreReviewProvisionError('PRODUCTION_REVIEW_ADOPTION_DISABLED');
  }
}

function identitySpecs(config: StoreReviewAccountConfig): ReviewIdentitySpec[] {
  return [
    { role: 'worker', phone: config.identifiers.workerPhone, email: null },
    {
      role: 'company',
      phone: config.identifiers.companyPhone,
      email: config.identifiers.companyEmail,
    },
    {
      role: 'admin',
      phone: config.identifiers.adminPhone,
      email: config.identifiers.adminEmail,
    },
  ];
}

async function loadCandidateUsers(
  client: PrismaClient | Prisma.TransactionClient,
  config: StoreReviewAccountConfig,
): Promise<ReviewUserRecord[]> {
  const specs = identitySpecs(config);
  const phones = specs.map((spec) => spec.phone);
  const emails = specs.flatMap((spec) => spec.email ? [spec.email] : []);
  return client.user.findMany({
    where: {
      OR: [
        { phone: { in: phones } },
        { email: { in: emails } },
        { pending_email: { in: emails } },
      ],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      pending_email: true,
      password_hash: true,
      role: true,
      is_active: true,
      is_review_account: true,
      deleted_at: true,
      worker: {
        select: {
          id: true,
          status: true,
          suspended_at: true,
          deleted_at: true,
        },
      },
      company: {
        select: {
          id: true,
          status: true,
          suspended_at: true,
          deleted_at: true,
        },
      },
      admin: { select: { id: true } },
    },
  });
}

function hasExpectedProfile(user: ReviewUserRecord, role: ReviewRole): boolean {
  if (role === 'worker') return Boolean(user.worker) && !user.company && !user.admin;
  if (role === 'company') return Boolean(user.company) && !user.worker && !user.admin;
  return Boolean(user.admin) && !user.worker && !user.company;
}

export async function classifyReviewAccounts(
  candidates: ReviewUserRecord[],
  config: StoreReviewAccountConfig,
): Promise<ClassifiedReviewAccount[]> {
  const specs = identitySpecs(config);
  for (const candidate of candidates) {
    if (specs.some((spec) => spec.email && candidate.pending_email === spec.email)) {
      throw new StoreReviewProvisionError('STORE_REVIEW_PENDING_EMAIL_IDENTIFIER_COLLISION');
    }
    const matchingSpecs = specs.filter((spec) =>
      candidate.phone === spec.phone || Boolean(spec.email && candidate.email === spec.email));
    if (matchingSpecs.length !== 1) {
      throw new StoreReviewProvisionError('STORE_REVIEW_CROSS_ROLE_IDENTIFIER_COLLISION');
    }
  }

  const classified: ClassifiedReviewAccount[] = [];
  for (const spec of specs) {
    const matches = candidates.filter((candidate) =>
      candidate.phone === spec.phone || Boolean(spec.email && candidate.email === spec.email));
    if (matches.length > 1) {
      throw new StoreReviewProvisionError(`STORE_REVIEW_SPLIT_IDENTITY:${spec.role}`);
    }

    const existing = matches[0] ?? null;
    if (existing) {
      if (existing.phone !== spec.phone || existing.email !== spec.email) {
        throw new StoreReviewProvisionError(`STORE_REVIEW_IDENTIFIER_COLLISION:${spec.role}`);
      }
      if (existing.role !== spec.role || !hasExpectedProfile(existing, spec.role)) {
        throw new StoreReviewProvisionError(`STORE_REVIEW_ROLE_PROFILE_COLLISION:${spec.role}`);
      }
    }

    const configuredPassword = config.passwords[spec.role];
    classified.push({
      spec,
      existing,
      passwordMatches: Boolean(
        existing?.password_hash
        && await bcrypt.compare(configuredPassword, existing.password_hash),
      ),
    });
  }
  return classified;
}

export function buildStoreReviewProvisionPlan(
  classified: ClassifiedReviewAccount[],
  options: StoreReviewProvisionOptions,
): StoreReviewProvisionPlan {
  return {
    mode: options.apply ? 'apply' : 'dry-run',
    accountCount: classified.length,
    createCount: classified.filter((account) => !account.existing).length,
    existingReviewCount: classified.filter((account) => account.existing?.is_review_account).length,
    adoptionRequiredCount: classified.filter((account) =>
      account.existing && !account.existing.is_review_account).length,
    passwordRotationRequiredCount: classified.filter((account) =>
      account.existing && !account.passwordMatches).length,
    privateDocumentSetupRequired: true,
    profilePhotoSetupRequired: true,
  };
}

export function assertStoreReviewPlanCanApply(
  plan: StoreReviewProvisionPlan,
  options: StoreReviewProvisionOptions,
): void {
  if (plan.adoptionRequiredCount > 0 && !options.adoptExisting) {
    throw new StoreReviewProvisionError('STORE_REVIEW_ADOPTION_REQUIRED');
  }
  if (plan.passwordRotationRequiredCount > 0 && !options.rotatePasswords) {
    throw new StoreReviewProvisionError('STORE_REVIEW_PASSWORD_ROTATION_REQUIRED');
  }
}

export function assertStoreReviewAdoptionSafe(
  role: ReviewRole,
  footprint: StoreReviewAdoptionFootprint,
): void {
  if (footprint.relationshipCount > 0 || footprint.profileDataPresent) {
    throw new StoreReviewProvisionError(`STORE_REVIEW_ADOPTION_DOMAIN_DATA_FORBIDDEN:${role}`);
  }
}

export type StoreReviewSessionResetReason =
  | 'store_review_adoption'
  | 'store_review_password_rotation'
  | 'store_review_reactivation';

function reviewProfileRequiresReactivation(user: ReviewUserRecord): boolean {
  if (user.role === Role.worker) {
    return !user.worker
      || user.worker.status !== WorkerStatus.approved
      || user.worker.suspended_at !== null
      || user.worker.deleted_at !== null;
  }
  if (user.role === Role.company) {
    return !user.company
      || user.company.status !== CompanyStatus.approved
      || user.company.suspended_at !== null
      || user.company.deleted_at !== null;
  }
  return false;
}

export function storeReviewSessionResetReason(
  account: ClassifiedReviewAccount,
  options: StoreReviewProvisionOptions,
): StoreReviewSessionResetReason | null {
  if (!account.existing) return null;
  if (!account.existing.is_review_account) return 'store_review_adoption';
  if (
    !account.existing.is_active
    || account.existing.deleted_at
    || reviewProfileRequiresReactivation(account.existing)
  ) {
    return 'store_review_reactivation';
  }
  if (options.rotatePasswords) return 'store_review_password_rotation';
  return null;
}

function hasStoredProfileData(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function isPristineWorkerAdoptionProfile(
  worker: StoreReviewWorkerAdoptionState,
): boolean {
  return worker.position === null
    && worker.profile_photo_url === null
    && !hasStoredProfileData(worker.skills)
    && !hasStoredProfileData(worker.languages)
    && !hasStoredProfileData(worker.documents)
    && worker.work_history_summary === null
    && !hasStoredProfileData(worker.work_history)
    && worker.gender === null
    && worker.whatsapp_available === false
    && worker.status === 'pending_otp'
    && worker.reject_reason === null
    && worker.approved_at === null
    && worker.approved_by_id === null
    && worker.rejected_at === null
    && worker.rejected_by_id === null
    && worker.suspended_at === null
    && worker.worker_class === null
    && worker.is_foc_training === false
    && worker.foc_training_note === null
    && worker.foc_training_updated_at === null
    && worker.foc_training_updated_by_id === null
    && worker.rating_avg === 0
    && worker.rating_count === 0
    && worker.availability === true
    && worker.deleted_at === null;
}

async function assertAdoptionCandidatesSafe(
  tx: Prisma.TransactionClient,
  classified: ClassifiedReviewAccount[],
): Promise<void> {
  for (const account of classified) {
    if (!account.existing || account.existing.is_review_account) continue;
    const state = await tx.user.findUnique({
      where: { id: account.existing.id },
      select: {
        is_active: true,
        deleted_at: true,
        _count: {
          select: {
            ratings_given: true,
            notifications: true,
            audit_logs: true,
            approved_workers: true,
            rejected_workers: true,
            foc_training_updates: true,
            approved_companies: true,
            rejected_companies: true,
            created_kiosk_sessions: true,
            created_venue_kiosks: true,
            activated_kiosk_sessions: true,
            order_status_history: true,
            moderation_reports: true,
            reviewed_moderation_reports: true,
            external_deletion_requests: true,
            reviewed_external_deletion_requests: true,
          },
        },
        worker: {
          select: {
            position: true,
            profile_photo_url: true,
            skills: true,
            languages: true,
            documents: true,
            work_history_summary: true,
            work_history: true,
            gender: true,
            whatsapp_available: true,
            status: true,
            reject_reason: true,
            approved_at: true,
            approved_by_id: true,
            rejected_at: true,
            rejected_by_id: true,
            suspended_at: true,
            worker_class: true,
            is_foc_training: true,
            foc_training_note: true,
            foc_training_updated_at: true,
            foc_training_updated_by_id: true,
            rating_avg: true,
            rating_count: true,
            availability: true,
            deleted_at: true,
            _count: { select: { assignments: true, ratings: true, positions: true } },
          },
        },
        company: {
          select: {
            docs_url: true,
            documents: true,
            status: true,
            reject_reason: true,
            approved_at: true,
            approved_by_id: true,
            rejected_at: true,
            rejected_by_id: true,
            suspended_at: true,
            deleted_at: true,
            _count: {
              select: {
                orders: true,
                kiosk_sessions: true,
                venue_kiosks: true,
                kiosk_active_sessions: true,
              },
            },
          },
        },
        admin: { select: { permissions: true } },
      },
    });
    if (!state) throw new StoreReviewProvisionError(`STORE_REVIEW_ADOPTION_MISSING:${account.spec.role}`);

    const idempotencyKeyCount = await tx.idempotencyKey.count({
      where: { actor_id: account.existing.id },
    });
    let relationshipCount = idempotencyKeyCount
      + Object.values(state._count).reduce((sum, count) => sum + count, 0);
    let profileDataPresent = !state.is_active || state.deleted_at !== null;
    if (account.spec.role === 'worker' && state.worker) {
      relationshipCount += Object.values(state.worker._count).reduce((sum, count) => sum + count, 0);
      profileDataPresent ||= !isPristineWorkerAdoptionProfile(state.worker);
    } else if (account.spec.role === 'company' && state.company) {
      relationshipCount += Object.values(state.company._count).reduce((sum, count) => sum + count, 0);
      profileDataPresent ||= Boolean(
        state.company.docs_url
        || state.company.status !== 'pending_approval'
        || state.company.reject_reason
        || state.company.approved_at
        || state.company.approved_by_id
        || state.company.rejected_at
        || state.company.rejected_by_id
        || state.company.suspended_at
        || state.company.deleted_at
        || hasStoredProfileData(state.company.documents),
      );
    } else if (account.spec.role === 'admin' && state.admin) {
      profileDataPresent ||= hasStoredProfileData(state.admin.permissions);
    }
    assertStoreReviewAdoptionSafe(account.spec.role, { relationshipCount, profileDataPresent });
  }
}

async function passwordHashes(config: StoreReviewAccountConfig): Promise<PasswordHashes> {
  const [worker, company, admin] = await Promise.all([
    bcrypt.hash(config.passwords.worker, BCRYPT_COST),
    bcrypt.hash(config.passwords.company, BCRYPT_COST),
    bcrypt.hash(config.passwords.admin, BCRYPT_COST),
  ]);
  return { worker, company, admin };
}

function providerTargetKey(channel: 'sms' | 'email', value: string): string {
  return channel === 'sms'
    ? `sms:${normalizePhone(value)}`
    : `email:${normalizeEmail(value)}`;
}

async function quarantineReviewProviderEvents(
  tx: Prisma.TransactionClient,
  classified: ClassifiedReviewAccount[],
  now: Date,
): Promise<number> {
  const targetKeys = new Set<string>();
  for (const account of classified) {
    targetKeys.add(providerTargetKey('sms', account.spec.phone));
    if (account.spec.email) targetKeys.add(providerTargetKey('email', account.spec.email));
    if (account.existing?.pending_email) {
      targetKeys.add(providerTargetKey('email', account.existing.pending_email));
    }
  }

  const existingIds = classified.flatMap((account) => account.existing ? [account.existing.id] : []);
  if (existingIds.length > 0) {
    const otpTargets = await tx.otpCode.findMany({
      where: { user_id: { in: existingIds } },
      select: { phone: true },
      distinct: ['phone'],
    });
    for (const otp of otpTargets) {
      if (otp.phone.startsWith('email:')) {
        targetKeys.add(providerTargetKey('email', otp.phone.slice('email:'.length)));
      } else {
        targetKeys.add(providerTargetKey('sms', otp.phone));
      }
    }
  }

  let quarantined = 0;
  let cursor: string | undefined;
  while (true) {
    const events = await tx.outboxEvent.findMany({
      where: {
        event_type: { in: ['provider.sms.send', 'provider.email.send'] },
        status: { in: ['pending', 'processing'] },
      },
      select: { id: true, event_type: true, payload: true },
      orderBy: { id: 'asc' },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (events.length === 0) break;
    for (const event of events) {
      let payload: ReturnType<typeof decryptProviderPayload>;
      try {
        payload = decryptProviderPayload(event.payload, event.id);
      } catch {
        throw new StoreReviewProvisionError('STORE_REVIEW_PROVIDER_EVENT_INSPECTION_FAILED');
      }
      if (!targetKeys.has(providerTargetKey(payload.channel, payload.to))) continue;
      const update = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: { in: ['pending', 'processing'] } },
        data: {
          status: 'processed',
          processed_at: now,
          last_error: 'StoreReviewExternalDeliverySuppressed',
        },
      });
      quarantined += update.count;
    }
    cursor = events.at(-1)?.id;
    if (events.length < 250) break;
  }
  return quarantined;
}

async function reconcileUser(
  tx: Prisma.TransactionClient,
  account: ClassifiedReviewAccount,
  passwordHash: string,
  options: StoreReviewProvisionOptions,
  now: Date,
) {
  const names: Record<ReviewRole, string> = {
    worker: 'Store Review Worker',
    company: 'Store Review Company Manager',
    admin: 'Store Review Administrator',
  };

  if (!account.existing) {
    return tx.user.create({
      data: {
        phone: account.spec.phone,
        email: account.spec.email,
        password_hash: passwordHash,
        password_set_at: now,
        role: account.spec.role,
        name: names[account.spec.role],
        email_verified_at: account.spec.email ? now : null,
        is_active: true,
        is_review_account: true,
      },
    });
  }

  const rotating = options.rotatePasswords;
  const sessionResetReason = storeReviewSessionResetReason(account, options);
  const revokeSessions = sessionResetReason !== null;
  const otpTargets = [
    account.spec.phone,
    ...(account.spec.email ? [`email:${account.spec.email}`] : []),
    ...(account.existing.pending_email ? [`email:${account.existing.pending_email}`] : []),
  ];
  const user = await tx.user.update({
    where: { id: account.existing.id },
    data: {
      phone: account.spec.phone,
      email: account.spec.email,
      role: account.spec.role,
      name: names[account.spec.role],
      email_verified_at: account.spec.email ? now : null,
      pending_email: null,
      email_verification_code_hash: null,
      email_verification_expires_at: null,
      email_verification_sent_at: null,
      email_verification_attempts: 0,
      email_verification_blocked_until: null,
      fcm_token: null,
      is_active: true,
      is_review_account: true,
      deleted_at: null,
      ...(rotating ? {
        password_hash: passwordHash,
        password_set_at: now,
      } : {}),
      ...(revokeSessions ? { session_version: { increment: 1 } } : {}),
    },
  });

  const deliveryTokenCleanup = tx.deviceToken.updateMany({
    where: { user_id: user.id, revoked_at: null },
    data: { revoked_at: now },
  });
  if (revokeSessions) {
    await Promise.all([
      tx.refreshToken.updateMany({
        where: { user_id: user.id, revoked_at: null },
        data: {
          revoked_at: now,
          revoked_reason: sessionResetReason,
        },
      }),
      deliveryTokenCleanup,
      tx.otpCode.updateMany({
        where: {
          consumed_at: null,
          OR: [
            { user_id: user.id },
            { phone: { in: otpTargets } },
          ],
        },
        data: { consumed_at: now, expires_at: now },
      }),
    ]);
  } else {
    await deliveryTokenCleanup;
  }
  return user;
}

async function reconcileReviewProfiles(
  tx: Prisma.TransactionClient,
  users: ProvisionedUsers,
  config: StoreReviewAccountConfig,
  now: Date,
) {
  const existingWorker = await tx.worker.findUnique({ where: { user_id: users.worker.id } });
  const worker = await tx.worker.upsert({
    where: { user_id: users.worker.id },
    update: {
      position: 'Event Service Worker',
      skills: [
        { name: 'Guest service', level: 4 },
        { name: 'Event setup', level: 4 },
      ],
      languages: ['Azərbaycan', 'English'],
      work_history_summary: 'Synthetic experience prepared only for store review.',
      work_history: [{
        company_name: 'Synthetic Event Venue',
        position: 'Event Service Worker',
        note: 'Demonstration record; it does not describe a real employer or person.',
      }],
      whatsapp_available: false,
      status: 'approved',
      approved_at: existingWorker?.approved_at ?? now,
      reject_reason: null,
      rejected_at: null,
      rejected_by_id: null,
      suspended_at: null,
      availability: true,
      deleted_at: null,
    },
    create: {
      user_id: users.worker.id,
      position: 'Event Service Worker',
      skills: [
        { name: 'Guest service', level: 4 },
        { name: 'Event setup', level: 4 },
      ],
      languages: ['Azərbaycan', 'English'],
      work_history_summary: 'Synthetic experience prepared only for store review.',
      work_history: [{
        company_name: 'Synthetic Event Venue',
        position: 'Event Service Worker',
        note: 'Demonstration record; it does not describe a real employer or person.',
      }],
      whatsapp_available: false,
      status: 'approved',
      approved_at: now,
      availability: true,
    },
  });

  const existingCompany = await tx.company.findUnique({ where: { user_id: users.company.id } });
  const company = await tx.company.upsert({
    where: { user_id: users.company.id },
    update: {
      name: 'Store Review Demo Company',
      status: 'approved',
      approved_at: existingCompany?.approved_at ?? now,
      reject_reason: null,
      rejected_at: null,
      rejected_by_id: null,
      suspended_at: null,
      deleted_at: null,
    },
    create: {
      user_id: users.company.id,
      name: 'Store Review Demo Company',
      status: 'approved',
      approved_at: now,
    },
  });

  await tx.admin.upsert({
    where: { user_id: users.admin.id },
    update: { permissions: [...config.adminPermissions] },
    create: { user_id: users.admin.id, permissions: [...config.adminPermissions] },
  });

  return { worker, company };
}

type PositionRecord = {
  id: string;
  name_az: string;
  subdepartment_id: string;
  subdepartment: { department_id: string };
};

async function requireFixturePosition(tx: Prisma.TransactionClient): Promise<PositionRecord> {
  const position = await tx.position.findUnique({
    where: { slug: 'waiter-waitress' },
    select: {
      id: true,
      name_az: true,
      subdepartment_id: true,
      subdepartment: { select: { department_id: true } },
    },
  });
  if (!position) throw new StoreReviewProvisionError('STORE_REVIEW_TAXONOMY_REQUIRED');
  return position;
}

type ReviewOrderInput = {
  title: string;
  description: string;
  shiftStart: Date;
  shiftEnd: Date;
  status: OrderStatus;
};

async function reconcileOrder(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  position: PositionRecord,
  input: ReviewOrderInput,
) {
  const existing = await tx.order.findFirst({
    where: { company_id: companyId, title: input.title },
    select: { id: true },
  });
  const data = {
    title: input.title,
    description: input.description,
    category: position.name_az,
    shift_start: input.shiftStart,
    shift_end: input.shiftEnd,
    required_count: 1,
    required_skills: ['Guest service'],
    location: 'Synthetic Review Venue',
    pay_rate: new Prisma.Decimal(20),
    notes: 'Synthetic store-review fixture; no real booking or customer is involved.',
    status: input.status,
    deleted_at: null,
  };

  const order = existing
    ? await tx.order.update({ where: { id: existing.id }, data })
    : await tx.order.create({ data: { company_id: companyId, ...data } });

  const category = await tx.orderCategoryItem.findFirst({
    where: { order_id: order.id, deleted_at: null },
    orderBy: { created_at: 'asc' },
  });
  const categoryData = {
    category: position.name_az,
    department_id: position.subdepartment.department_id,
    subdepartment_id: position.subdepartment_id,
    position_id: position.id,
    required_count: 1,
    notes: 'Synthetic store-review fixture.',
    deleted_at: null,
  };
  const categoryItem = category
    ? await tx.orderCategoryItem.update({ where: { id: category.id }, data: categoryData })
    : await tx.orderCategoryItem.create({ data: { order_id: order.id, ...categoryData } });

  const history = await tx.orderStatusHistory.findFirst({
    where: { order_id: order.id, reason: STORE_REVIEW_FIXTURE_VERSION },
    select: { id: true },
  });
  if (!history) {
    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        from_status: input.status === 'completed' ? 'in_progress' : 'assigned',
        to_status: input.status,
        actor_id: actorId,
        actor_role: 'company',
        reason: STORE_REVIEW_FIXTURE_VERSION,
        version: order.version,
      },
    });
  }
  return { order, categoryItem };
}

async function reconcileAssignment(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    categoryItemId: string;
    position: PositionRecord;
    workerId: string;
    status: AssignmentStatus;
    assignedAt: Date;
    checkinTime?: Date;
    checkoutTime?: Date;
  },
) {
  const assignment = await tx.assignment.upsert({
    where: {
      order_id_worker_id: { order_id: input.orderId, worker_id: input.workerId },
    },
    update: {
      order_category_item_id: input.categoryItemId,
      assigned_category: input.position.name_az,
      position_id: input.position.id,
      status: input.status,
      assigned_at: input.assignedAt,
      attendance_activity_at: input.checkoutTime ?? input.checkinTime ?? input.assignedAt,
      last_checkin_at: input.checkinTime,
      last_checkout_at: input.checkoutTime,
      deleted_at: null,
    },
    create: {
      order_id: input.orderId,
      order_category_item_id: input.categoryItemId,
      assigned_category: input.position.name_az,
      position_id: input.position.id,
      worker_id: input.workerId,
      status: input.status,
      assigned_at: input.assignedAt,
      attendance_activity_at: input.checkoutTime ?? input.checkinTime ?? input.assignedAt,
      last_checkin_at: input.checkinTime,
      last_checkout_at: input.checkoutTime,
    },
  });

  if (input.checkinTime && input.checkoutTime) {
    const existing = await tx.attendanceLog.findFirst({
      where: { assignment_id: assignment.id, deleted_at: null },
      select: { id: true },
    });
    const attendanceData = {
      checkin_time: input.checkinTime,
      checkout_time: input.checkoutTime,
      checkin_notes: 'Synthetic store-review attendance.',
      checkout_notes: 'Synthetic store-review attendance.',
      deleted_at: null,
    };
    if (existing) {
      await tx.attendanceLog.update({ where: { id: existing.id }, data: attendanceData });
    } else {
      await tx.attendanceLog.create({
        data: { assignment_id: assignment.id, ...attendanceData },
      });
    }
  }
  return assignment;
}

async function reconcileNotification(
  tx: Prisma.TransactionClient,
  input: {
    recipientId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata: Prisma.InputJsonObject;
  },
) {
  const existing = await tx.notification.findFirst({
    where: {
      recipient_id: input.recipientId,
      channel: 'in_app',
      title: input.title,
      deleted_at: null,
    },
    select: { id: true },
  });
  const data = {
    type: input.type,
    channel: 'in_app' as const,
    title: input.title,
    body: input.body,
    metadata: input.metadata,
    read_at: null,
    deleted_at: null,
  };
  return existing
    ? tx.notification.update({ where: { id: existing.id }, data })
    : tx.notification.create({ data: { recipient_id: input.recipientId, ...data } });
}

async function reconcileOperationalFixtures(
  tx: Prisma.TransactionClient,
  users: ProvisionedUsers,
  profiles: Awaited<ReturnType<typeof reconcileReviewProfiles>>,
  now: Date,
  quarantinedProviderEventCount: number,
) {
  const position = await requireFixturePosition(tx);
  await tx.workerPosition.upsert({
    where: {
      worker_id_position_id: { worker_id: profiles.worker.id, position_id: position.id },
    },
    update: {},
    create: { worker_id: profiles.worker.id, position_id: position.id },
  });

  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const active = await reconcileOrder(tx, profiles.company.id, users.company.id, position, {
    title: STORE_REVIEW_ACTIVE_ORDER_TITLE,
    description: 'Synthetic active shift for reviewing assignments and attendance.',
    shiftStart: new Date(now.getTime() - hour),
    shiftEnd: new Date(now.getTime() + STORE_REVIEW_ACTIVE_ORDER_WINDOW_DAYS * day),
    status: 'in_progress',
  });
  const completed = await reconcileOrder(tx, profiles.company.id, users.company.id, position, {
    title: STORE_REVIEW_COMPLETED_ORDER_TITLE,
    description: 'Synthetic completed shift with a closed attendance record.',
    shiftStart: new Date(now.getTime() - 72 * hour),
    shiftEnd: new Date(now.getTime() - 64 * hour),
    status: 'completed',
  });

  const activeAssignment = await reconcileAssignment(tx, {
    orderId: active.order.id,
    categoryItemId: active.categoryItem.id,
    position,
    workerId: profiles.worker.id,
    status: 'accepted',
    assignedAt: new Date(now.getTime() - 24 * hour),
  });
  const historicalCheckin = new Date(now.getTime() - 72 * hour);
  const historicalCheckout = new Date(now.getTime() - 64 * hour);
  const completedAssignment = await reconcileAssignment(tx, {
    orderId: completed.order.id,
    categoryItemId: completed.categoryItem.id,
    position,
    workerId: profiles.worker.id,
    status: 'completed',
    assignedAt: new Date(now.getTime() - 96 * hour),
    checkinTime: historicalCheckin,
    checkoutTime: historicalCheckout,
  });

  await Promise.all([
    reconcileNotification(tx, {
      recipientId: users.worker.id,
      type: 'job_assigned',
      title: 'Store review: active assignment',
      body: 'A synthetic assignment is ready for reviewer inspection.',
      metadata: {
        fixture: STORE_REVIEW_FIXTURE_VERSION,
        order_id: active.order.id,
        assignment_id: activeAssignment.id,
      },
    }),
    reconcileNotification(tx, {
      recipientId: users.worker.id,
      type: 'system',
      title: 'Store review: attendance history',
      body: 'A synthetic completed attendance record is available.',
      metadata: {
        fixture: STORE_REVIEW_FIXTURE_VERSION,
        order_id: completed.order.id,
        assignment_id: completedAssignment.id,
      },
    }),
    reconcileNotification(tx, {
      recipientId: users.company.id,
      type: 'system',
      title: 'Store review: company sample data',
      body: 'Synthetic active and completed orders are available for review.',
      metadata: { fixture: STORE_REVIEW_FIXTURE_VERSION },
    }),
    reconcileNotification(tx, {
      recipientId: users.admin.id,
      type: 'system',
      title: 'Store review: isolated sample data',
      body: 'Only synthetic store-review records should be visible to this account.',
      metadata: { fixture: STORE_REVIEW_FIXTURE_VERSION },
    }),
  ]);

  await tx.auditLog.create({
    data: {
      actor_id: users.admin.id,
      actor_role: 'admin',
      action: 'status_changed',
      entity_type: 'store_review_fixture',
      entity_id: users.admin.id,
      metadata: {
        event: 'store_review_fixture_reconciled',
        fixture: STORE_REVIEW_FIXTURE_VERSION,
        quarantined_provider_event_count: quarantinedProviderEventCount,
      },
    },
  });
}

async function inspectPlan(
  client: PrismaClient | Prisma.TransactionClient,
  config: StoreReviewAccountConfig,
  options: StoreReviewProvisionOptions,
) {
  const candidates = await loadCandidateUsers(client, config);
  const classified = await classifyReviewAccounts(candidates, config);
  return { classified, plan: buildStoreReviewProvisionPlan(classified, options) };
}

export async function provisionStoreReviewAccounts(
  client: PrismaClient,
  config: StoreReviewAccountConfig,
  options: StoreReviewProvisionOptions,
  now = new Date(),
): Promise<StoreReviewProvisionPlan> {
  assertStoreReviewProvisionAllowed(options);
  if (!options.apply) {
    return (await inspectPlan(client, config, options)).plan;
  }

  const hashes = await passwordHashes(config);
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await client.$transaction(async (tx) => {
        // Selecting the void-returning function directly makes Prisma try to
        // deserialize PostgreSQL's `void` type and raises P2010. Returning only
        // a boolean keeps the transaction-scoped advisory lock semantics while
        // using a Prisma-supported result type.
        const lockRows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT TRUE AS "acquired"
          FROM pg_advisory_xact_lock(hashtext(${REVIEW_LOCK_NAME}))
        `;
        if (lockRows.length !== 1 || lockRows[0]?.acquired !== true) {
          throw new StoreReviewProvisionError('STORE_REVIEW_ADVISORY_LOCK_FAILED');
        }

        const { classified, plan } = await inspectPlan(tx, config, options);
        assertStoreReviewPlanCanApply(plan, options);
        await assertAdoptionCandidatesSafe(tx, classified);
        const quarantinedProviderEventCount = await quarantineReviewProviderEvents(
          tx,
          classified,
          now,
        );

        const byRole = new Map(classified.map((account) => [account.spec.role, account]));
        const workerAccount = byRole.get('worker');
        const companyAccount = byRole.get('company');
        const adminAccount = byRole.get('admin');
        if (!workerAccount || !companyAccount || !adminAccount) {
          throw new StoreReviewProvisionError('STORE_REVIEW_ACCOUNT_PLAN_INVALID');
        }

        const users: ProvisionedUsers = {
          worker: await reconcileUser(tx, workerAccount, hashes.worker, options, now),
          company: await reconcileUser(tx, companyAccount, hashes.company, options, now),
          admin: await reconcileUser(tx, adminAccount, hashes.admin, options, now),
        };
        const profiles = await reconcileReviewProfiles(tx, users, config, now);
        await reconcileOperationalFixtures(
          tx,
          users,
          profiles,
          now,
          quarantinedProviderEventCount,
        );
        return plan;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2034';
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
    }
  }
  throw new StoreReviewProvisionError('STORE_REVIEW_SERIALIZABLE_RETRY_EXHAUSTED');
}

function safeErrorCode(error: unknown): string {
  if (error instanceof StoreReviewProvisionError) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_:-]{2,160}$/.test(error.message)) {
    return error.message;
  }
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

async function main(): Promise<void> {
  const options = parseStoreReviewProvisionArgs(process.argv.slice(2));
  assertStoreReviewProvisionAllowed(options);
  const config = resolveStoreReviewAccountConfig();
  const prisma = new PrismaClient();
  try {
    const plan = await provisionStoreReviewAccounts(prisma, config, options);
    console.log('Store review provisioning completed.', {
      mode: plan.mode,
      account_count: plan.accountCount,
      create_count: plan.createCount,
      existing_review_count: plan.existingReviewCount,
      adoption_required_count: plan.adoptionRequiredCount,
      password_rotation_required_count: plan.passwordRotationRequiredCount,
      private_document_setup_required: plan.privateDocumentSetupRequired,
      profile_photo_setup_required: plan.profilePhotoSetupRequired,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('Store review provisioning failed.', { error_code: safeErrorCode(error) });
    process.exitCode = 1;
  });
}
