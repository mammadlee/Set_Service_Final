import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPushToDeviceTargets, sendPushToUser } from '../../lib/fcm';
import { normalizeEmail } from '../../lib/password';
import { CompanyStatus, Role } from '../../types/prisma';
import { startEmailVerification } from '../auth/auth.service';
import { createUploadService } from '../../lib/uploads';
import { inspectUpload, scanUpload } from '../../lib/file-security';
import { logger } from '../../lib/logger';
import { enqueueStorageCleanupEvents } from '../../lib/storage-cleanup-outbox';

const COMPANY_STATUSES = new Set<string>([
  'pending_approval',
  'approved',
  'rejected',
  'suspended',
  'inactive',
]);

export async function getMyCompany(userId: string) {
  const company = await prisma.company.findUnique({
    where: { user_id: userId },
    include: { user: { select: { name: true, phone: true, email: true, email_verified_at: true, pending_email: true } } },
  });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company must be approved before using company APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }
  return toCompanyProfile(company);
}

export async function updateMyCompany(userId: string, data: { name?: string; email?: string | null }) {
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company must be approved before using company APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }

  const { email } = data;
  const companyData: Prisma.CompanyUpdateInput = {};
  if (data.name !== undefined) companyData.name = data.name;
  let updated = await prisma.company.update({
    where: { user_id: userId },
    data: companyData,
    include: { user: { select: { name: true, phone: true, email: true, email_verified_at: true, pending_email: true } } },
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
    updated = await prisma.company.findUniqueOrThrow({
      where: { user_id: userId },
      include: { user: { select: { name: true, phone: true, email: true, email_verified_at: true, pending_email: true } } },
    });
  }
  return toCompanyProfile(updated);
}

export async function listCompanies(filters: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sort: 'asc' | 'desc';
}) {
  const page = filters.page;
  const limit = filters.limit;
  const where: Record<string, unknown> = { deleted_at: null };

  if (filters.status && !COMPANY_STATUSES.has(filters.status)) {
    throw Errors.badRequest('Invalid company status filter.', 'INVALID_COMPANY_STATUS');
  }

  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { user: { name: { contains: filters.search, mode: 'insensitive' } } },
      { user: { phone: { contains: filters.search } } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: { user: { select: { name: true, phone: true, email: true } } },
      orderBy: [
        { created_at: filters.sort },
        { id: filters.sort },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: data.map(toCompanyProfile),
    meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findFirst({
    where: { id, deleted_at: null },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');
  return toCompanyProfile(company);
}

export async function approveCompany(id: string, actor: { sub: string; role: string }) {
  const company = await prisma.company.findFirst({
    where: { id, deleted_at: null },
    include: {
      user: {
        include: {
          otp_codes: {
            where: { purpose: 'company_registration', consumed_at: { not: null } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');
  if (company.status === 'approved') {
    return toCompanyProfile(company);
  }
  const missingPrerequisites = companyApprovalPrerequisites(company);
  if (missingPrerequisites.length > 0) {
    throw Errors.conflict(
      'Company registration prerequisites are incomplete.',
      'APPROVAL_PREREQUISITES_MISSING',
      { status: company.status, missing: missingPrerequisites }
    );
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const transition = await tx.company.updateMany({
      where: {
        id,
        status: 'pending_approval',
        deleted_at: null,
        user: {
          password_set_at: { not: null },
          email_verified_at: { not: null },
          is_active: true,
          deleted_at: null,
          otp_codes: {
            some: { purpose: 'company_registration', consumed_at: { not: null } },
          },
        },
      },
      data: {
        status: 'approved' as CompanyStatus,
        reject_reason: null,
        approved_at: new Date(),
        approved_by_id: actor.sub,
      },
    });

    if (transition.count !== 1) {
      const current = await tx.company.findFirst({
        where: { id, deleted_at: null },
        include: { user: { select: { name: true, phone: true, email: true } } },
      });
      if (current?.status === 'approved') {
        return { company: current, transitioned: false };
      }
      throw Errors.conflict('Company approval state changed.', 'COMPANY_APPROVAL_STATE_CHANGED');
    }

    const updatedCompany = await tx.company.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role as Role,
        action: 'company_approved',
        entity_type: 'company',
        entity_id: id,
        metadata: { previous_status: company.status, new_status: updatedCompany.status },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: company.user_id,
        type: 'company_approved',
        title: 'Müəssisə təsdiqləndi',
        body: 'Müəssisə hesabınız təsdiqləndi.',
        metadata: { company_id: id },
      },
    });

    return { company: updatedCompany, transitioned: true };
  });

  if (updated.transitioned) {
    await sendPushToUser(company.user_id, {
      title: 'Müəssisə təsdiqləndi',
      body: 'Artıq sifariş yarada bilərsiniz.',
      data: { type: 'company_approved', company_id: id, role: 'company' },
    });
  }

  return toCompanyProfile(updated.company);
}

export async function rejectCompany(id: string, reason: string, actor: { sub: string; role: string }) {
  const company = await prisma.company.findFirst({
    where: { id, deleted_at: null },
    include: { user: true },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'pending_approval') {
    throw Errors.conflict(
      'Only a company awaiting approval can be rejected.',
      'COMPANY_REJECTION_NOT_PENDING',
      { status: company.status }
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const transition = await tx.company.updateMany({
      where: {
        id,
        status: 'pending_approval',
        deleted_at: null,
      },
      data: {
        status: 'rejected' as CompanyStatus,
        reject_reason: reason,
        rejected_at: now,
        rejected_by_id: actor.sub,
      },
    });

    if (transition.count !== 1) {
      const current = await tx.company.findFirst({
        where: { id, deleted_at: null },
        select: { status: true },
      });
      throw Errors.conflict(
        'Company rejection state changed. Please retry.',
        'COMPANY_REJECTION_STATE_CHANGED',
        { status: current?.status ?? 'deleted' }
      );
    }

    const updatedCompany = await tx.company.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });

    const rejectionPushTargets = await tx.deviceToken.findMany({
      where: { user_id: company.user_id, revoked_at: null, deleted_at: null },
      select: { id: true, token: true },
    });
    await tx.user.update({
      where: { id: company.user_id },
      data: { session_version: { increment: 1 } },
    });
    await tx.refreshToken.updateMany({
      where: { user_id: company.user_id, revoked_at: null },
      data: { revoked_at: now, revoked_reason: 'account_change' },
    });
    await tx.deviceToken.updateMany({
      where: { user_id: company.user_id, revoked_at: null },
      data: { revoked_at: now, deleted_at: now },
    });

    await tx.auditLog.create({
      data: {
        actor_id: actor.sub,
        actor_role: actor.role as Role,
        action: 'company_rejected',
        entity_type: 'company',
        entity_id: id,
        metadata: { previous_status: company.status, new_status: updatedCompany.status, reason },
      },
    });

    await tx.notification.create({
      data: {
        recipient_id: company.user_id,
        type: 'company_rejected',
        title: 'Müəssisə rədd edildi',
        body: 'Müəssisə hesabınız rədd edildi.',
        metadata: { company_id: id, reason },
      },
    });

    return { company: updatedCompany, rejectionPushTargets };
  });

  await sendPushToDeviceTargets(updated.rejectionPushTargets, {
    title: 'Müəssisə rədd edildi',
    body: 'Müəssisə hesabınız rədd edildi.',
    data: { type: 'company_rejected', company_id: id, role: 'company' },
  });

  return toCompanyProfile(updated.company);
}

function toCompanyProfile(company: {
  id: string;
  user_id: string;
  user: {
    name: string;
    phone: string;
    email?: string | null;
    email_verified_at?: Date | null;
    pending_email?: string | null;
  };
  name: string;
  status: string;
  documents?: unknown;
  reject_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: company.id,
    user_id: company.user_id,
    name: company.name,
    contact_name: company.user.name,
    phone: company.user.phone,
    email: company.user.email,
    email_verified_at: company.user.email_verified_at ?? null,
    pending_email: company.user.pending_email ?? null,
    email_verified: Boolean(company.user.email && company.user.email_verified_at),
    status: company.status,
    documents: companyDocumentResponseMetadata(company.documents, company.id),
    reject_reason: company.reject_reason,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}

type CompanyDocumentType = 'registration_certificate' | 'tax_certificate' | 'operating_license' | 'other';
type CompanyDocument = {
  type: string;
  name?: string;
  key?: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  status?: 'ready' | 'rejected' | 'deleted';
  scan_status?: 'pending' | 'clean' | 'infected' | 'error';
  scanner?: string;
  scanned_at?: string;
  content_sha256?: string;
};

export async function uploadMyCompanyDocument(
  userId: string,
  type: string | undefined,
  file: Express.Multer.File | undefined
) {
  const documentType = parseCompanyDocumentType(type);
  if (!file) throw Errors.badRequest('Upload file is required.', 'UPLOAD_FILE_REQUIRED');
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (!['pending_approval', 'approved'].includes(company.status)) {
    throw Errors.forbidden('Company registration does not accept documents.', 'COMPANY_ENROLLMENT_CLOSED');
  }

  const inspection = await inspectUpload(
    file,
    new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  );
  const uploadService = createUploadService();
  const quarantineKey = `companies/${company.id}/quarantine/${crypto.randomUUID()}${inspection.extension}`;
  const finalKey = `companies/${company.id}/documents/${documentType}/${crypto.randomUUID()}${inspection.extension}`;
  await uploadService.putPrivateObject({
    key: quarantineKey,
    contentType: inspection.detectedMimeType,
    body: file.buffer,
    downloadName: inspection.safeOriginalName,
  });

  let scan;
  try {
    scan = await scanUpload(file.buffer, inspection, { sensitive: true });
    await uploadService.promotePrivateObject(quarantineKey, finalKey);
  } catch (error) {
    await deleteCompanyObjectBestEffort(quarantineKey, 'company_quarantine_cleanup');
    await deleteCompanyObjectBestEffort(finalKey, 'company_failed_promotion_cleanup');
    throw error;
  }

  const nextDocument: CompanyDocument = {
    type: documentType,
    name: inspection.safeOriginalName,
    key: finalKey,
    mime_type: inspection.detectedMimeType,
    size_bytes: inspection.sizeBytes,
    uploaded_at: new Date().toISOString(),
    status: 'ready',
    scan_status: scan.status,
    scanner: scan.scanner,
    scanned_at: scan.scannedAt,
    content_sha256: inspection.sha256,
  };

  try {
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${company.id}::uuid FOR UPDATE`;
      const current = await tx.company.findUniqueOrThrow({ where: { id: company.id }, select: { documents: true } });
      const currentDocuments = normalizeCompanyDocuments(current.documents);
      const previous = currentDocuments.find((item) => item.type === documentType);
      const documents = [...currentDocuments.filter((item) => item.type !== documentType), nextDocument];
      const saved = await tx.company.update({
        where: { id: company.id },
        data: { documents: documents as Prisma.InputJsonValue, docs_url: null },
        include: { user: { select: { name: true, phone: true, email: true, email_verified_at: true, pending_email: true } } },
      });
      if (previous?.key && privateDocumentKeyBelongsToCompany(previous.key, company.id, documentType)) {
        await enqueueStorageCleanupEvents(tx, {
          aggregate: 'company_document',
          aggregateId: company.id,
          reason: 'company_document_replaced',
          objects: [{ key: previous.key, visibility: 'private' }],
        });
      }
      await tx.auditLog.create({
        data: {
          actor_id: userId,
          actor_role: 'company' as Role,
          action: 'status_changed',
          entity_type: 'company_document',
          entity_id: company.id,
          metadata: {
            event: previous ? 'document_replaced' : 'document_uploaded',
            document_type: documentType,
            content_sha256: inspection.sha256,
            scan_status: scan.status,
          },
        },
      });
      return saved;
    });
    return toCompanyProfile(updated);
  } catch (error) {
    await deleteCompanyObjectBestEffort(finalKey, 'company_document_rollback');
    throw error;
  }
}

export async function getCompanyDocumentDownload(
  actor: { sub: string; role: string },
  companyId: string,
  type: string
) {
  const documentType = parseCompanyDocumentType(type);
  const company = await prisma.company.findFirst({
    where: { id: companyId, deleted_at: null },
    select: { id: true, documents: true },
  });
  if (!company) throw Errors.notFound('Company document not found.', 'COMPANY_DOCUMENT_NOT_FOUND');
  const document = normalizeCompanyDocuments(company.documents).find((item) => item.type === documentType);
  if (
    !document?.key
    || document.status !== 'ready'
    || document.scan_status !== 'clean'
    || !privateDocumentKeyBelongsToCompany(document.key, company.id, documentType)
  ) {
    throw Errors.gone('Company document must be uploaded again through private storage.', 'COMPANY_DOCUMENT_REUPLOAD_REQUIRED');
  }
  const expiresIn = signedDocumentUrlTtl();
  const url = await createUploadService().createSignedDownloadUrl(document.key, expiresIn, document.name);
  await prisma.auditLog.create({
    data: {
      actor_id: actor.sub,
      actor_role: actor.role as Role,
      action: 'status_changed',
      entity_type: 'company_document',
      entity_id: company.id,
      metadata: {
        event: 'document_download_authorized',
        document_type: documentType,
        object_key_hash: crypto.createHash('sha256').update(document.key).digest('hex'),
        expires_in_seconds: expiresIn,
      },
    },
  });
  return {
    url,
    expires_in_seconds: expiresIn,
  };
}

export async function getMyCompanyDocumentDownload(actor: { sub: string; role: string }, type: string) {
  const company = await prisma.company.findFirst({ where: { user_id: actor.sub, deleted_at: null }, select: { id: true } });
  if (!company) throw Errors.notFound('Company document not found.', 'COMPANY_DOCUMENT_NOT_FOUND');
  return getCompanyDocumentDownload(actor, company.id, type);
}

function companyApprovalPrerequisites(company: {
  id: string;
  name: string;
  status: string;
  documents: unknown;
  user: {
    name: string;
    phone: string;
    email: string | null;
    email_verified_at: Date | null;
    password_set_at: Date | null;
    is_active: boolean;
    deleted_at: Date | null;
    otp_codes: { id: string }[];
  };
}): string[] {
  const missing: string[] = [];
  if (company.status !== 'pending_approval') missing.push('status_pending_approval');
  if (!company.user.password_set_at) missing.push('password_set');
  if (!company.user.is_active || company.user.deleted_at) missing.push('active_account');
  if (company.user.otp_codes.length === 0) missing.push('registration_otp_consumed');
  if (!company.user.name.trim()) missing.push('contact_name');
  if (!company.user.phone.trim()) missing.push('phone');
  if (!company.name.trim()) missing.push('company_name');
  if (!company.user.email || !company.user.email_verified_at) missing.push('verified_email');
  const required = normalizeCompanyDocuments(company.documents).find((item) => item.type === 'registration_certificate');
  if (
    !required?.key
    || required.status !== 'ready'
    || required.scan_status !== 'clean'
    || !privateDocumentKeyBelongsToCompany(required.key, company.id, 'registration_certificate')
  ) missing.push('document:registration_certificate');
  return missing;
}

function parseCompanyDocumentType(value: string | undefined): CompanyDocumentType {
  if (value === 'registration_certificate' || value === 'tax_certificate' || value === 'operating_license' || value === 'other') return value;
  throw Errors.badRequest('Invalid company document type.', 'INVALID_DOCUMENT_TYPE');
}

function normalizeCompanyDocuments(value: unknown): CompanyDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.type !== 'string') return [];
    return [{
      type: raw.type,
      name: typeof raw.name === 'string' ? raw.name : undefined,
      key: typeof raw.key === 'string' ? raw.key : undefined,
      mime_type: typeof raw.mime_type === 'string' ? raw.mime_type : undefined,
      size_bytes: typeof raw.size_bytes === 'number' ? raw.size_bytes : undefined,
      uploaded_at: typeof raw.uploaded_at === 'string' ? raw.uploaded_at : undefined,
      status: raw.status === 'ready' || raw.status === 'rejected' || raw.status === 'deleted' ? raw.status : undefined,
      scan_status: raw.scan_status === 'pending' || raw.scan_status === 'clean' || raw.scan_status === 'infected' || raw.scan_status === 'error' ? raw.scan_status : undefined,
      scanner: typeof raw.scanner === 'string' ? raw.scanner : undefined,
      scanned_at: typeof raw.scanned_at === 'string' ? raw.scanned_at : undefined,
      content_sha256: typeof raw.content_sha256 === 'string' ? raw.content_sha256 : undefined,
    }];
  });
}

function companyDocumentResponseMetadata(value: unknown, companyId: string) {
  return normalizeCompanyDocuments(value).map((document) => {
    const available = Boolean(
      document.key
      && document.status === 'ready'
      && document.scan_status === 'clean'
      && privateDocumentKeyBelongsToCompany(document.key, companyId, document.type)
    );
    return {
      type: document.type,
      name: document.name,
      mime_type: document.mime_type,
      size_bytes: document.size_bytes,
      uploaded_at: document.uploaded_at,
      status: document.status ?? 'legacy',
      scan_status: document.scan_status ?? 'unscanned',
      available,
    };
  });
}

function privateDocumentKeyBelongsToCompany(key: string, companyId: string, type: string) {
  return key.startsWith(`companies/${companyId}/documents/${type}/`);
}

async function deleteCompanyObjectBestEffort(key: string, reason: string) {
  try {
    await createUploadService().deleteObject(key, 'private');
  } catch (error) {
    logger.warn('company_document_cleanup_failed', {
      reason,
      key_hash: crypto.createHash('sha256').update(key).digest('hex'),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function signedDocumentUrlTtl() {
  const value = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? 300);
  return Number.isInteger(value) && value >= 1 && value <= 900 ? value : 300;
}
