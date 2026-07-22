import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { sendPushToUser } from '../../lib/fcm';
import { logger } from '../../lib/logger';
import {
  AttendanceQrPayload,
  generateAttendanceQrToken,
  hashQrToken,
  verifyAttendanceQrToken,
} from '../../lib/qr';
import { Role } from '../../types/prisma';
import { ORDER_ATTENDANCE_STATUSES } from '../orders/orders.lifecycle';
import {
  CheckInInput,
  CheckOutInput,
  ActivateVenueKioskInput,
  CreateKioskSessionInput,
  CreateVenueKioskInput,
  GenerateQrTokenInput,
  ListVenueKiosksQueryInput,
  ListAttendanceQueryInput,
} from './attendance.schema';
import * as AttendanceRepository from './attendance.repository';

type AttendanceRecord = NonNullable<Awaited<ReturnType<typeof AttendanceRepository.findAttendanceById>>>;
type AssignmentRecord = NonNullable<Awaited<ReturnType<typeof AttendanceRepository.findAcceptedAssignmentById>>>;
type CompanyRecord = NonNullable<Awaited<ReturnType<typeof AttendanceRepository.findCompanyByUserId>>>;
type WorkerRecord = NonNullable<Awaited<ReturnType<typeof AttendanceRepository.findWorkerByUserId>>>;
type KioskSessionRecord = AttendanceRepository.KioskSessionWithContext;
type VenueKioskRecord = AttendanceRepository.VenueKioskWithContext;

const KIOSK_QR_REFRESH_SECONDS = 30;
const KIOSK_TOKEN_BYTES = 32;
const DEFAULT_KIOSK_SESSION_TTL_HOURS = 12;

export async function generateQrToken(userId: string, roleValue: string, input: GenerateQrTokenInput) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const assignment = await getAssignmentForQr(input.assignment_id);
  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    if (assignment.order.company_id !== company.id) {
      throw Errors.forbidden('Müəssisə yalnız öz sifarişləri üçün QR yarada bilər.', 'FORBIDDEN');
    }
  }

  const qr = generateAttendanceQrToken({
    assignmentId: assignment.id,
    orderId: assignment.order_id,
    companyId: assignment.order.company_id,
    ttlSeconds: input.ttl_seconds,
  });
  await AttendanceRepository.registerAttendanceQrToken({
    tokenHash: hashQrToken(qr.token),
    nonce: qr.nonce,
    assignmentId: assignment.id,
    orderId: assignment.order_id,
    companyId: assignment.order.company_id,
    expiresAt: qr.expiresAt,
  });

  return {
    assignment_id: assignment.id,
    order_id: assignment.order_id,
    order_title: assignment.order.title,
    company_id: assignment.order.company_id,
    company_name: assignment.order.company.name,
    token: qr.token,
    expires_at: qr.expiresAt,
    refresh_after_seconds: KIOSK_QR_REFRESH_SECONDS,
  };
}

export async function createKioskSession(userId: string, roleValue: string, input: CreateKioskSessionInput) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const assignment = await getAssignmentForQr(input.assignment_id);
  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    if (assignment.order.company_id !== company.id) {
      throw Errors.forbidden('Müəssisə yalnız öz sifarişləri üçün kiosk sessiyası yarada bilər.', 'FORBIDDEN');
    }
  }

  const expiresAt = parseKioskExpiry(input.expires_at);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const kioskToken = generateKioskDisplayToken();
    try {
      const session = await AttendanceRepository.createKioskSession({
        tokenHash: hashKioskToken(kioskToken),
        companyId: assignment.order.company_id,
        orderId: assignment.order_id,
        assignmentId: assignment.id,
        createdById: userId,
        expiresAt,
      });

      return {
        ...toKioskSessionResponse(session),
        kiosk_token: kioskToken,
        kiosk_url: buildKioskUrl(kioskToken),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  throw Errors.internal('Kiosk sessiyası tokeni yaradıla bilmədi.', 'KIOSK_TOKEN_CREATE_FAILED');
}

export async function getKioskSession(token: string) {
  const venueKiosk = await AttendanceRepository.findVenueKioskByTokenHash(hashKioskToken(token));
  if (venueKiosk) return toVenueKioskPublicResponse(venueKiosk);

  const session = await findValidKioskSessionByToken(token);
  return toKioskSessionResponse(session);
}

export async function generateKioskQrToken(token: string) {
  const venueKiosk = await AttendanceRepository.findVenueKioskByTokenHash(hashKioskToken(token));
  if (venueKiosk) return await generateVenueKioskQrTokenFromRecord(venueKiosk);

  const session = await findValidKioskSessionByToken(token);
  const qr = generateAttendanceQrToken({
    assignmentId: session.assignment_id,
    orderId: session.order_id,
    companyId: session.company_id,
    kioskSessionId: session.id,
    ttlSeconds: KIOSK_QR_REFRESH_SECONDS,
  });
  await AttendanceRepository.registerAttendanceQrToken({
    tokenHash: hashQrToken(qr.token),
    nonce: qr.nonce,
    assignmentId: session.assignment_id,
    orderId: session.order_id,
    companyId: session.company_id,
    kioskSessionId: session.id,
    expiresAt: qr.expiresAt,
  });

  return {
    ...toKioskSessionResponse(session),
    token: qr.token,
    expires_at: qr.expiresAt,
    refresh_after_seconds: KIOSK_QR_REFRESH_SECONDS,
    kiosk_expires_at: session.expires_at,
  };
}

export async function createVenueKiosk(userId: string, roleValue: string, input: CreateVenueKioskInput) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const companyId = await resolveManageableCompanyId(userId, role, input.company_id);
  const name = input.name.trim();
  const locationLabel = input.location_label?.trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const kioskToken = generateKioskDisplayToken();
    try {
      const kiosk = await AttendanceRepository.createVenueKiosk({
        tokenHash: hashKioskToken(kioskToken),
        tokenCiphertext: encryptKioskToken(kioskToken),
        companyId,
        name,
        locationLabel,
        createdById: userId,
      });

      return {
        ...toVenueKioskPublicResponse(kiosk),
        kiosk_token: kioskToken,
        kiosk_url: buildKioskUrl(kioskToken),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  throw Errors.internal('Venue kiosk tokeni yaradıla bilmədi.', 'KIOSK_TOKEN_CREATE_FAILED');
}

export async function listVenueKiosks(userId: string, roleValue: string, filters: ListVenueKiosksQueryInput) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu bölməyə giriş icazəniz yoxdur.', 'FORBIDDEN');
  }

  let companyId = filters.company_id;
  if (role === 'company') {
    companyId = (await getApprovedCompanyForUser(userId)).id;
  }

  return {
    data: (await AttendanceRepository.listVenueKiosks({
      deleted_at: null,
      ...(companyId ? { company_id: companyId } : {}),
    })).map(toVenueKioskManagementResponse),
  };
}

export async function activateVenueKiosk(
  userId: string,
  roleValue: string,
  id: string,
  input: ActivateVenueKioskInput
) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const kiosk = await findManageableVenueKiosk(id, userId, role);
  if (kiosk.status !== 'active' || kiosk.revoked_at !== null) {
    throw Errors.gone('Bu QR ekranı deaktiv edilib.', 'VENUE_KIOSK_DISABLED');
  }

  const order = await AttendanceRepository.findOrderForKiosk(input.order_id);
  if (!order || order.deleted_at !== null) {
    throw Errors.notFound('Sifariş tapılmadı.', 'ORDER_NOT_FOUND');
  }
  if (order.company_id !== kiosk.company_id) {
    throw Errors.forbidden('Kiosk yalnız öz müəssisəsinin sifarişləri üçün aktiv edilə bilər.', 'FORBIDDEN');
  }
  if (!ORDER_ATTENDANCE_STATUSES.includes(order.status)) {
    throw Errors.conflict('QR ekranı yalnız aktiv sifariş üçün aktiv edilə bilər.', 'ORDER_NOT_ACTIVE');
  }
  if (order._count.assignments < 1) {
    throw Errors.conflict('Bu sifariş üzrə işi qəbul etmiş işçi yoxdur.', 'NO_ACCEPTED_ASSIGNMENTS');
  }

  const activated = await AttendanceRepository.activateVenueKiosk({
    kioskId: kiosk.id,
    companyId: kiosk.company_id,
    orderId: order.id,
    activatedById: userId,
    expiresAt: parseOptionalFutureDate(input.expires_at, 'Kiosk aktiv sessiyasının bitmə tarixi gələcək tarix olmalıdır.'),
  });
  if (!activated) throw Errors.gone('Bu QR ekranÄ± deaktiv edilib.', 'VENUE_KIOSK_DISABLED');
  return toVenueKioskManagementResponse(activated);
}

export async function deactivateVenueKiosk(userId: string, roleValue: string, id: string) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const companyId = role === 'company' ? (await getApprovedCompanyForUser(userId)).id : undefined;
  const kiosk = await AttendanceRepository.deactivateVenueKiosk({ id, companyId });
  if (!kiosk) throw Errors.notFound('QR ekranı tapılmadı.', 'VENUE_KIOSK_NOT_FOUND');
  return toVenueKioskManagementResponse(kiosk);
}

export async function disableVenueKiosk(userId: string, roleValue: string, id: string) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const companyId = role === 'company' ? (await getApprovedCompanyForUser(userId)).id : undefined;
  const kiosk = await AttendanceRepository.disableVenueKiosk({ id, companyId });
  if (!kiosk) throw Errors.notFound('QR ekranı tapılmadı.', 'VENUE_KIOSK_NOT_FOUND');
  return toVenueKioskManagementResponse(kiosk);
}

export async function revokeKioskSession(userId: string, roleValue: string, id: string) {
  const role = parseRole(roleValue);
  if (role !== 'super_admin' && role !== 'admin' && role !== 'company') {
    throw Errors.forbidden('Bu əməliyyat üçün icazəniz yoxdur.', 'FORBIDDEN');
  }

  const session = await AttendanceRepository.findKioskSessionById(id);
  if (!session) throw Errors.notFound('Kiosk sessiyası tapılmadı.', 'KIOSK_SESSION_NOT_FOUND');

  let companyId: string | undefined;
  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    if (session.company_id !== company.id) {
      throw Errors.forbidden('Müəssisə yalnız öz sifarişləri üzrə kiosk sessiyalarını deaktiv edə bilər.', 'FORBIDDEN');
    }
    companyId = company.id;
  }

  if (session.revoked_at) return;

  const result = await AttendanceRepository.revokeKioskSession({ id, companyId });
  if (result.count !== 1) {
    throw Errors.conflict('Kiosk sessiyası deaktiv edilə bilmədi.', 'KIOSK_SESSION_REVOKE_FAILED');
  }
}

export async function checkIn(userId: string, roleValue: string, input: CheckInInput) {
  const role = parseRole(roleValue);
  if (role !== 'worker') {
    throw Errors.forbidden('Yalnız təsdiqlənmiş işçi giriş edə bilər.', 'FORBIDDEN');
  }

  const worker = await getApprovedWorkerForUser(userId);
  const { assignment, payload } = await getWorkerAssignmentForQr(input.qr_token, input.assignment_id, worker.id);

  const result = await AttendanceRepository.createCheckInWithAudit({
    assignmentId: assignment.id,
    workerId: worker.id,
    actorId: userId,
    actorRole: role,
    qr: toQrContext(input.qr_token, payload),
    location: input.location,
    notes: input.notes,
  });

  if (result.kind !== 'checked_in') {
    if (result.kind === 'already_checked_in') {
      throw Errors.conflict('Bu təyinat üzrə artıq giriş edilib.', 'ATTENDANCE_ALREADY_CHECKED_IN');
    }
    if (result.kind === 'already_completed') {
      throw Errors.conflict(
        'Bu təyinat üzrə giriş-çıxış artıq tamamlanıb.',
        'ATTENDANCE_ALREADY_COMPLETED'
      );
    }
    if (result.kind === 'assignment_not_accepted') {
      throw Errors.conflict('Giriş üçün təyinat qəbul edilmiş və sifariş aktiv olmalıdır.', 'ASSIGNMENT_NOT_ACCEPTED');
    }
    throwQrUseError(result.kind);
  }

  await createAttendanceNotificationSafely(result.attendance, 'checked_in');
  await sendPushToUser(result.attendance.assignment.order.company.user.id, {
    title: 'İşçi giriş etdi',
    body: `${result.attendance.assignment.worker.user.name} "${result.attendance.assignment.order.title}" üzrə giriş etdi.`,
    data: {
      type: 'attendance_checked_in',
      attendance_id: result.attendance.id,
      assignment_id: result.attendance.assignment_id,
      order_id: result.attendance.assignment.order_id,
      role: 'company',
    },
  });

  return toAttendanceResponse(result.attendance, role);
}

export async function checkOut(userId: string, roleValue: string, input: CheckOutInput) {
  const role = parseRole(roleValue);
  if (role !== 'worker') {
    throw Errors.forbidden('Yalnız təsdiqlənmiş işçi çıxış edə bilər.', 'FORBIDDEN');
  }

  const worker = await getApprovedWorkerForUser(userId);
  const { assignment, payload } = await getWorkerAssignmentForQr(input.qr_token, input.assignment_id, worker.id);

  const result = await AttendanceRepository.checkOutWithAudit({
    assignmentId: assignment.id,
    workerId: worker.id,
    actorId: userId,
    actorRole: role,
    qr: toQrContext(input.qr_token, payload),
    location: input.location,
    notes: input.notes,
  });

  if (result.kind !== 'checked_out') {
    if (result.kind === 'not_checked_in') {
      throw Errors.badRequest('Çıxış üçün əvvəlcə giriş edilməlidir.', 'ATTENDANCE_NOT_CHECKED_IN');
    }
    if (result.kind === 'assignment_not_accepted') {
      throw Errors.conflict('Çıxış üçün təyinat qəbul edilmiş və sifariş aktiv olmalıdır.', 'ASSIGNMENT_NOT_ACCEPTED');
    }
    throwQrUseError(result.kind);
  }

  await createAttendanceNotificationSafely(result.attendance, 'checked_out');
  await sendPushToUser(result.attendance.assignment.order.company.user.id, {
    title: 'İşçi çıxış etdi',
    body: `${result.attendance.assignment.worker.user.name} "${result.attendance.assignment.order.title}" üzrə çıxış etdi.`,
    data: {
      type: 'attendance_checked_out',
      attendance_id: result.attendance.id,
      assignment_id: result.attendance.assignment_id,
      order_id: result.attendance.assignment.order_id,
      role: 'company',
    },
  });

  return toAttendanceResponse(result.attendance, role);
}

async function createAttendanceNotificationSafely(
  attendance: AttendanceRepository.AttendanceWithRelations,
  event: 'checked_in' | 'checked_out'
): Promise<void> {
  try {
    await AttendanceRepository.createAttendanceNotification(attendance, event);
  } catch (error) {
    logger.warn('Attendance notification creation skipped after non-fatal error', {
      event,
      attendance_id: attendance.id,
      assignment_id: attendance.assignment_id,
      order_id: attendance.assignment.order_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listAttendance(userId: string, roleValue: string, filters: ListAttendanceQueryInput) {
  const role = parseRole(roleValue);
  const where: Prisma.AttendanceLogWhereInput = { deleted_at: null };

  if (filters.assignment_id) where.assignment_id = filters.assignment_id;
  if (filters.open_only !== undefined) {
    where.checkout_time = filters.open_only ? null : { not: null };
  }

  if (role === 'super_admin' || role === 'admin') {
    if (filters.worker_id || filters.order_id) {
      where.assignment = {
        ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
        ...(filters.order_id ? { order_id: filters.order_id } : {}),
      };
    }
  } else if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    where.assignment = {
      ...(filters.worker_id ? { worker_id: filters.worker_id } : {}),
      ...(filters.order_id ? { order_id: filters.order_id } : {}),
      order: { company_id: company.id, deleted_at: null },
    };
  } else if (role === 'worker') {
    const worker = await getApprovedWorkerForUser(userId);
    if (filters.worker_id && filters.worker_id !== worker.id) {
      throw Errors.forbidden('Workers can view only their own attendance records.', 'FORBIDDEN');
    }
    where.assignment = {
      worker_id: worker.id,
      deleted_at: null,
      ...(filters.order_id ? { order_id: filters.order_id } : {}),
      order: { deleted_at: null },
    };
  } else {
    throw Errors.forbidden('Hesab rolu dəstəklənmir.', 'FORBIDDEN');
  }

  const { data, total } = await AttendanceRepository.listAttendance({
    where,
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort,
  });

  return {
    data: data.map((attendance: AttendanceRecord) => toAttendanceResponse(attendance, role)),
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getAttendance(id: string, userId: string, roleValue: string) {
  const role = parseRole(roleValue);
  const attendance = await findVisibleAttendance(id, userId, role);
  if (!attendance) throw Errors.notFound('Giriş-çıxış qeydi tapılmadı.', 'ATTENDANCE_NOT_FOUND');
  return toAttendanceResponse(attendance, role);
}

async function findValidKioskSessionByToken(token: string): Promise<KioskSessionRecord> {
  const session = await AttendanceRepository.findKioskSessionByTokenHash(hashKioskToken(token));
  if (!session) throw Errors.notFound('QR ekranı tapılmadı.', 'KIOSK_SESSION_NOT_FOUND');
  ensureKioskSessionActive(session);
  return session;
}

async function findManageableVenueKiosk(id: string, userId: string, role: Role): Promise<VenueKioskRecord> {
  const kiosk = await AttendanceRepository.findVenueKioskById(id);
  if (!kiosk) throw Errors.notFound('QR ekranı tapılmadı.', 'VENUE_KIOSK_NOT_FOUND');
  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    if (kiosk.company_id !== company.id) {
      throw Errors.forbidden('Müəssisə yalnız öz venue kiosklarını idarə edə bilər.', 'FORBIDDEN');
    }
  }
  return kiosk;
}

async function resolveManageableCompanyId(
  userId: string,
  role: Role,
  requestedCompanyId?: string
): Promise<string> {
  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    if (requestedCompanyId && requestedCompanyId !== company.id) {
      throw Errors.forbidden('Müəssisə yalnız öz venue üçün kiosk yarada bilər.', 'FORBIDDEN');
    }
    return company.id;
  }

  if (!requestedCompanyId) {
    throw Errors.badRequest('Company is required for venue kiosk creation.', 'COMPANY_REQUIRED');
  }
  return requestedCompanyId;
}

async function generateVenueKioskQrTokenFromRecord(kiosk: VenueKioskRecord) {
  ensureVenueKioskUsable(kiosk);
  const activeSession = getUsableActiveSession(kiosk);
  if (!activeSession) {
    throw Errors.conflict('QR ekranı hazır deyil. Admin tərəfindən aktiv ediləcək.', 'KIOSK_WAITING_FOR_ACTIVE_ORDER');
  }

  const qr = generateAttendanceQrToken({
    orderId: activeSession.order_id,
    companyId: activeSession.company_id,
    kioskId: kiosk.id,
    kioskSessionId: activeSession.id,
    ttlSeconds: KIOSK_QR_REFRESH_SECONDS,
  });
  await AttendanceRepository.registerAttendanceQrToken({
    tokenHash: hashQrToken(qr.token),
    nonce: qr.nonce,
    orderId: activeSession.order_id,
    companyId: activeSession.company_id,
    kioskId: kiosk.id,
    kioskSessionId: activeSession.id,
    expiresAt: qr.expiresAt,
  });

  return {
    ...toVenueKioskPublicResponse(kiosk),
    token: qr.token,
    expires_at: qr.expiresAt,
    refresh_after_seconds: KIOSK_QR_REFRESH_SECONDS,
    kiosk_expires_at: activeSession.expires_at,
  };
}

function ensureVenueKioskUsable(kiosk: VenueKioskRecord): void {
  if (
    kiosk.deleted_at !== null ||
    kiosk.revoked_at !== null ||
    kiosk.status !== 'active' ||
    kiosk.company.deleted_at !== null ||
    kiosk.company.status !== 'approved'
  ) {
    throw Errors.gone('Bu QR ekranı deaktiv edilib.', 'VENUE_KIOSK_DISABLED');
  }
}

function getUsableActiveSession(kiosk: VenueKioskRecord) {
  const session = kiosk.active_sessions[0];
  if (!session) return null;
  const expired = session.expires_at !== null && session.expires_at.getTime() <= Date.now();
  if (
    expired ||
    session.revoked_at !== null ||
    session.deleted_at !== null ||
    session.status !== 'active' ||
    session.order.deleted_at !== null ||
    !ORDER_ATTENDANCE_STATUSES.includes(session.order.status) ||
    session.order.company_id !== kiosk.company_id
  ) {
    return null;
  }
  return session;
}

function ensureKioskSessionActive(session: KioskSessionRecord): void {
  const now = Date.now();
  const expired = session.expires_at !== null && session.expires_at.getTime() <= now;
  const inactive =
    session.deleted_at !== null ||
    session.revoked_at !== null ||
    expired ||
    session.company.deleted_at !== null ||
    session.company.status !== 'approved' ||
    session.order.deleted_at !== null ||
    !ORDER_ATTENDANCE_STATUSES.includes(session.order.status) ||
    session.assignment.deleted_at !== null ||
    session.assignment.status !== 'accepted' ||
    session.assignment.order_id !== session.order_id ||
    session.order.company_id !== session.company_id;

  if (inactive) {
    throw Errors.gone('QR ekranı deaktiv edilib.', 'KIOSK_SESSION_INACTIVE');
  }
}

function parseKioskExpiry(value?: string): Date {
  if (!value) {
    return new Date(Date.now() + getKioskSessionTtlHours() * 60 * 60 * 1000);
  }

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw Errors.badRequest('Kiosk sessiyasının bitmə tarixi gələcək tarix olmalıdır.', 'INVALID_KIOSK_EXPIRY');
  }
  return expiresAt;
}

function parseOptionalFutureDate(value: string | undefined, message: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw Errors.badRequest(message, 'INVALID_KIOSK_EXPIRY');
  }
  return date;
}

function getKioskSessionTtlHours(): number {
  const configured = Number(process.env.KIOSK_SESSION_TTL_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_KIOSK_SESSION_TTL_HOURS;
}

function generateKioskDisplayToken(): string {
  return crypto.randomBytes(KIOSK_TOKEN_BYTES).toString('base64url');
}

function hashKioskToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function encryptKioskToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kioskEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptKioskToken(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    const [ivPart, tagPart, encryptedPart] = ciphertext.split('.');
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      kioskEncryptionKey(),
      Buffer.from(ivPart, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function kioskEncryptionKey(): Buffer {
  const secret =
    process.env.KIOSK_TOKEN_ENCRYPTION_SECRET ??
    (process.env.NODE_ENV !== 'production' ? 'development-kiosk-token-encryption-secret' : undefined);
  if (!secret) {
    throw new Error('KIOSK_TOKEN_ENCRYPTION_SECRET is required in production.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function buildKioskUrl(token: string): string {
  const base = (process.env.KIOSK_PUBLIC_BASE_URL ?? process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const path = `/kiosk#capability=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

function toKioskSessionResponse(session: KioskSessionRecord) {
  return {
    id: session.id,
    assignment_id: session.assignment_id,
    order_id: session.order_id,
    order_title: session.order.title,
    company_id: session.company_id,
    company_name: session.company.name,
    location: session.order.location,
    shift_start: session.order.shift_start,
    shift_end: session.order.shift_end,
    category: session.assignment.order_category_item?.category ?? session.assignment.assigned_category,
    status: session.revoked_at || session.deleted_at ? 'inactive' : 'active',
    kiosk_status: session.revoked_at || session.deleted_at ? 'inactive' : 'active',
    expires_at: session.expires_at,
    revoked_at: session.revoked_at,
    refresh_interval_seconds: KIOSK_QR_REFRESH_SECONDS,
  };
}

function toVenueKioskPublicResponse(kiosk: VenueKioskRecord) {
  const activeSession = getUsableActiveSession(kiosk);
  return {
    id: kiosk.id,
    kiosk_id: kiosk.id,
    company_id: kiosk.company_id,
    company_name: kiosk.company.name,
    name: kiosk.name,
    kiosk_name: kiosk.name,
    location_label: kiosk.location_label,
    status: kiosk.status,
    kiosk_status: kiosk.status,
    revoked_at: kiosk.revoked_at,
    created_at: kiosk.created_at,
    updated_at: kiosk.updated_at,
    refresh_interval_seconds: KIOSK_QR_REFRESH_SECONDS,
    active_session: activeSession
      ? {
          id: activeSession.id,
          order_id: activeSession.order_id,
          order_title: activeSession.order.title,
          company_id: activeSession.company_id,
          status: activeSession.status,
          activated_at: activeSession.activated_at,
          expires_at: activeSession.expires_at,
          location: activeSession.order.location,
          shift_start: activeSession.order.shift_start,
          shift_end: activeSession.order.shift_end,
        }
      : null,
    order_id: activeSession?.order_id ?? null,
    order_title: activeSession?.order.title ?? null,
    location: activeSession?.order.location ?? kiosk.location_label,
    shift_start: activeSession?.order.shift_start ?? null,
    shift_end: activeSession?.order.shift_end ?? null,
  };
}

function toVenueKioskManagementResponse(kiosk: VenueKioskRecord) {
  const response = toVenueKioskPublicResponse(kiosk);
  const kioskToken = decryptKioskToken(kiosk.token_ciphertext);
  return {
    ...response,
    kiosk_url: kioskToken ? buildKioskUrl(kioskToken) : undefined,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function findVisibleAttendance(id: string, userId: string, role: Role): Promise<AttendanceRecord | null> {
  if (role === 'super_admin' || role === 'admin') return AttendanceRepository.findAttendanceById(id);

  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    return AttendanceRepository.findAttendanceByIdForCompany(id, company.id);
  }

  if (role === 'worker') {
    const worker = await getApprovedWorkerForUser(userId);
    return AttendanceRepository.findAttendanceByIdForWorker(id, worker.id);
  }

  return null;
}

async function getAssignmentForQr(assignmentId: string): Promise<AssignmentRecord> {
  const assignment = await AttendanceRepository.findAcceptedAssignmentById(assignmentId);
  if (!assignment) throw Errors.notFound('Təyinat tapılmadı.', 'ASSIGNMENT_NOT_FOUND');
  if (
    assignment.status !== 'accepted' ||
    !ORDER_ATTENDANCE_STATUSES.includes(assignment.order.status) ||
    assignment.order.deleted_at !== null
  ) {
    throw Errors.conflict('QR yaratmaq üçün təyinat qəbul edilmiş və sifariş aktiv olmalıdır.', 'ASSIGNMENT_NOT_ACCEPTED');
  }
  return assignment;
}

async function getWorkerAssignmentForQr(
  qrToken: string,
  submittedAssignmentId: string | undefined,
  workerId: string
): Promise<{ assignment: AssignmentRecord; payload: AttendanceQrPayload }> {
  const verified = verifyAttendanceQrToken(qrToken);
  if (!verified.valid) {
    if (verified.expired) throw Errors.gone('QR token has expired.', 'QR_TOKEN_EXPIRED');
    throw Errors.unauthorized('QR token yanlışdır.', 'QR_TOKEN_INVALID');
  }

  if (verified.payload.assignment_id) {
    const assignment = await getWorkerAcceptedAssignment(verified.payload.assignment_id, workerId);
    verifyPayloadForAssignment(verified.payload, assignment);
    return { assignment, payload: verified.payload };
  }

  const assignment = await AttendanceRepository.findAcceptedAssignmentForWorkerOrder(workerId, verified.payload.order_id);
  if (!assignment) {
    throw Errors.notFound(
      'Bu sifariş üçün sizə təsdiqlənmiş təyinat tapılmadı.',
      'KIOSK_ASSIGNMENT_NOT_FOUND'
    );
  }
  if (submittedAssignmentId && submittedAssignmentId !== assignment.id) {
    // The QR is order-based; use the authenticated worker's accepted assignment for that order.
  }
  verifyPayloadForAssignment(verified.payload, assignment);
  return { assignment, payload: verified.payload };
}

async function getWorkerAcceptedAssignment(assignmentId: string, workerId: string): Promise<AssignmentRecord> {
  const assignment = await AttendanceRepository.findAcceptedAssignmentById(assignmentId);
  if (!assignment) throw Errors.notFound('Təyinat tapılmadı.', 'ASSIGNMENT_NOT_FOUND');
  if (assignment.worker_id !== workerId) {
    throw Errors.forbidden('Worker can use attendance only for own assignment.', 'FORBIDDEN');
  }
  if (
    assignment.status !== 'accepted' ||
    !ORDER_ATTENDANCE_STATUSES.includes(assignment.order.status) ||
    assignment.order.deleted_at !== null
  ) {
    throw Errors.conflict('Davamiyyət üçün təyinat qəbul edilmiş və sifariş aktiv olmalıdır.', 'ASSIGNMENT_NOT_ACCEPTED', {
      status: assignment.status,
      order_status: assignment.order.status,
    });
  }
  return assignment;
}

function verifyQrForAssignment(qrToken: string, assignment: AssignmentRecord): void {
  const verified = verifyAttendanceQrToken(qrToken);
  if (!verified.valid) {
    if (verified.expired) throw Errors.gone('QR token has expired.', 'QR_TOKEN_EXPIRED');
    throw Errors.unauthorized('QR token yanlışdır.', 'QR_TOKEN_INVALID');
  }

  verifyPayloadForAssignment(verified.payload, assignment);
}

function verifyPayloadForAssignment(
  payload: {
    assignment_id?: string;
    order_id: string;
    company_id: string;
  },
  assignment: AssignmentRecord
): void {
  if (
    (payload.assignment_id && payload.assignment_id !== assignment.id) ||
    payload.order_id !== assignment.order_id ||
    payload.company_id !== assignment.order.company_id
  ) {
    throw Errors.unauthorized('QR token bu təyinat üçün uyğun deyil.', 'QR_TOKEN_INVALID');
  }
}

function toQrContext(qrToken: string, payload: AttendanceQrPayload): AttendanceRepository.AttendanceQrContext {
  return {
    tokenHash: hashQrToken(qrToken),
    nonce: payload.nonce,
    assignmentId: payload.assignment_id,
    orderId: payload.order_id,
    companyId: payload.company_id,
    kioskId: payload.kiosk_id,
    kioskSessionId: payload.kiosk_session_id,
  };
}

function throwQrUseError(kind: 'qr_invalid' | 'qr_expired' | 'qr_revoked' | 'qr_replayed'): never {
  if (kind === 'qr_expired') throw Errors.gone('QR token has expired.', 'QR_TOKEN_EXPIRED');
  if (kind === 'qr_revoked') throw Errors.gone('QR session has been revoked.', 'QR_TOKEN_REVOKED');
  if (kind === 'qr_replayed') {
    throw Errors.conflict('This QR token was already used by the worker.', 'QR_TOKEN_REPLAYED');
  }
  throw Errors.unauthorized('QR token yanlÄ±ÅŸdÄ±r.', 'QR_TOKEN_INVALID');
}

async function getApprovedCompanyForUser(userId: string): Promise<CompanyRecord> {
  const company = await AttendanceRepository.findCompanyByUserId(userId);
  if (!company || company.deleted_at) throw Errors.notFound('Müəssisə profili tapılmadı.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Davamiyyət üçün müəssisə hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }
  return company;
}

async function getApprovedWorkerForUser(userId: string): Promise<WorkerRecord> {
  const worker = await AttendanceRepository.findWorkerByUserId(userId);
  if (!worker || worker.deleted_at) throw Errors.notFound('İşçi profili tapılmadı.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Davamiyyət üçün işçi hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }
  return worker;
}

function parseRole(role: string): Role {
  if (role === 'super_admin' || role === 'admin' || role === 'company' || role === 'worker') return role;
  throw Errors.forbidden('Hesab rolu dəstəklənmir.', 'FORBIDDEN');
}

function toAttendanceResponse(attendance: AttendanceRecord, viewerRole: Role) {
  return {
    id: attendance.id,
    assignment_id: attendance.assignment_id,
    checkin_time: attendance.checkin_time,
    checkout_time: attendance.checkout_time,
    duration_minutes: calculateDurationMinutes(attendance.checkin_time, attendance.checkout_time),
    checkin_location: attendance.checkin_location,
    checkout_location: attendance.checkout_location,
    checkin_notes: attendance.checkin_notes,
    checkout_notes: attendance.checkout_notes,
    created_at: attendance.created_at,
    updated_at: attendance.updated_at,
    assignment: {
      id: attendance.assignment.id,
      status: attendance.assignment.status,
      worker: {
        id: attendance.assignment.worker.id,
        name: attendance.assignment.worker.user.name,
        ...(viewerRole === 'company' ? {} : { phone: attendance.assignment.worker.user.phone }),
      },
      order: {
        id: attendance.assignment.order.id,
        title: attendance.assignment.order.title,
        status: attendance.assignment.order.status,
        company: {
          id: attendance.assignment.order.company.id,
          name: attendance.assignment.order.company.name,
        },
      },
    },
  };
}

function calculateDurationMinutes(checkinTime: Date | null, checkoutTime: Date | null): number | null {
  if (!checkinTime || !checkoutTime) return null;
  return Math.max(0, Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 60000));
}
