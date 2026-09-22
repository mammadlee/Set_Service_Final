import crypto from 'crypto';
import { ExternalDeletionRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { hmacSha256 } from '../../lib/crypto';
import { normalizeEmail } from '../../lib/password';
import { normalizePhone } from '../../lib/phone';
import { Role } from '../../types/prisma';
import { requestMyAccountDeletion as deleteWorkerAccount } from '../workers/workers.service';
import { requestMyAccountDeletion as deleteCompanyAccount } from '../companies/companies.service';

export interface PublicAccountDeletionInput {
  role: 'worker' | 'company';
  identifier: string;
  note?: string;
}

function deletionIdentifierSecret(): string {
  const secret = process.env.OTP_PEPPER ?? (process.env.NODE_ENV !== 'production' ? process.env.JWT_ACCESS_SECRET : undefined);
  if (!secret || secret.length < 32) throw new Error('A configured secret is required for deletion request identifiers.');
  return secret;
}

export async function recordAccountDeletionRequest(input: PublicAccountDeletionInput): Promise<void> {
  const rawIdentifier = input.identifier.trim();
  const identifierKind = rawIdentifier.includes('@') ? 'email' : 'phone';
  const normalizedIdentifier = identifierKind === 'email'
    ? normalizeEmail(rawIdentifier)
    : normalizePhone(rawIdentifier);
  const identifierHmac = hmacSha256(
    `external_account_deletion:v1:${input.role}:${identifierKind}:${normalizedIdentifier}`,
    deletionIdentifierSecret(),
  );

  const user = await prisma.user.findFirst({
    where: {
      role: input.role as Role,
      is_active: true,
      deleted_at: null,
      ...(identifierKind === 'email'
        ? { OR: [{ email: normalizedIdentifier }, { pending_email: normalizedIdentifier }] }
        : { phone: normalizedIdentifier }),
    },
    select: {
      id: true,
      worker: { select: { deleted_at: true } },
      company: { select: { deleted_at: true } },
    },
  });
  const activeProfile = input.role === 'worker'
    ? Boolean(user?.worker && !user.worker.deleted_at)
    : Boolean(user?.company && !user.company.deleted_at);
  const accountUserId = activeProfile ? user!.id : null;
  const requestId = crypto.randomUUID();
  const note = redactContactDetails(input.note, rawIdentifier, normalizedIdentifier);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.externalAccountDeletionRequest.create({
      data: {
        id: requestId,
        role: input.role as Role,
        identifier_kind: identifierKind,
        identifier_hmac: identifierHmac,
        account_user_id: accountUserId,
        note,
      },
    });

    const admins = await tx.user.findMany({
      where: {
        role: 'super_admin',
        is_active: true,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          recipient_id: admin.id,
          type: 'system',
          channel: 'in_app',
          title: 'Hesab silmə müraciəti',
          body: 'İctimai formadan yeni hesab silmə müraciəti daxil olub.',
          metadata: { request_id: requestId, source: 'public_web_form' },
        })),
      });
    }
  });
}

export function redactContactDetails(note: string | undefined, ...identifiers: string[]): string | null {
  if (!note?.trim()) return null;
  let safeNote = note.trim();
  for (const identifier of identifiers) {
    if (identifier) safeNote = safeNote.split(identifier).join('[redacted]');
  }
  return safeNote
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\+[1-9][\d\s().-]{7,20}/g, '[redacted]');
}

export async function listExternalDeletionRequests(input: {
  page: number;
  limit: number;
  status?: ExternalDeletionRequestStatus;
}) {
  const where: Prisma.ExternalAccountDeletionRequestWhereInput = input.status ? { status: input.status } : {};
  const [total, data] = await prisma.$transaction([
    prisma.externalAccountDeletionRequest.count({ where }),
    prisma.externalAccountDeletionRequest.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        role: true,
        identifier_kind: true,
        account_user_id: true,
        note: true,
        status: true,
        reviewed_by_id: true,
        reviewed_at: true,
        resolution_note: true,
        created_at: true,
        updated_at: true,
      },
    }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total, total_pages: Math.ceil(total / input.limit) } };
}

export async function getExternalDeletionRequest(id: string) {
  const request = await prisma.externalAccountDeletionRequest.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      identifier_kind: true,
      account_user_id: true,
      note: true,
      status: true,
      reviewed_by_id: true,
      reviewed_at: true,
      resolution_note: true,
      created_at: true,
      updated_at: true,
    },
  });
  if (!request) throw Errors.notFound('Deletion request not found.', 'DELETION_REQUEST_NOT_FOUND');
  const linkedAccount = request.account_user_id
    ? await prisma.user.findUnique({
      where: { id: request.account_user_id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        deleted_at: true,
        worker: { select: { id: true } },
        company: { select: { id: true } },
      },
    })
    : null;
  return { ...request, linked_account: linkedAccount };
}

export async function reviewExternalDeletionRequest(
  id: string,
  actorId: string,
  input: {
    status: 'reviewing' | 'resolved' | 'dismissed';
    resolution_note?: string;
    ownership_verification?: 'authenticated_account' | 'verified_phone_support' | 'verified_email_support';
  },
) {
  const current = await getExternalDeletionRequest(id);
  if (current.status !== 'open' && current.status !== 'reviewing') {
    throw Errors.conflict('Deletion request is already closed.', 'DELETION_REQUEST_CLOSED');
  }
  if (input.status === 'reviewing' && current.status !== 'open') {
    throw Errors.conflict('Deletion request is already under review.', 'DELETION_REQUEST_REVIEWING');
  }
  if (input.status === 'resolved') {
    if (current.status !== 'reviewing' || !current.account_user_id || !input.ownership_verification || !input.resolution_note?.trim()) {
      throw Errors.badRequest('Resolution requires a linked account, documented ownership verification, and a review note.', 'DELETION_VERIFICATION_REQUIRED');
    }
  }
  if (input.status === 'dismissed' && !input.resolution_note?.trim()) {
    throw Errors.badRequest('Dismissal requires a review note.', 'DELETION_REVIEW_NOTE_REQUIRED');
  }
  if (input.status === 'resolved') {
    const user = await prisma.user.findUnique({
      where: { id: current.account_user_id! },
      select: {
        deleted_at: true,
        is_active: true,
        worker: { select: { deleted_at: true } },
        company: { select: { deleted_at: true } },
      },
    });
    if (!user) {
      throw Errors.conflict('Linked account no longer exists; manual review is required.', 'DELETION_ACCOUNT_MISSING');
    }
    const profileDeleted = current.role === 'worker'
      ? Boolean(user.worker?.deleted_at)
      : Boolean(user.company?.deleted_at);
    if (!user.deleted_at || user.is_active || !profileDeleted) {
      if (current.role === 'worker') {
        await deleteWorkerAccount(current.account_user_id!, { sub: actorId, role: 'super_admin' });
      } else {
        await deleteCompanyAccount(current.account_user_id!, { sub: actorId, role: 'super_admin' });
      }
    }
  }
  const now = new Date();
  const resolutionNote = redactContactDetails(input.resolution_note);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.externalAccountDeletionRequest.updateMany({
      where: { id, status: current.status },
      data: {
        status: input.status,
        reviewed_by_id: actorId,
        reviewed_at: now,
        resolution_note: resolutionNote,
      },
    });
    if (updated.count !== 1) {
      throw Errors.conflict('Deletion request state changed. Retry.', 'DELETION_REQUEST_STATE_CHANGED');
    }
    await tx.auditLog.create({
      data: {
        actor_id: actorId,
        actor_role: 'super_admin' as Role,
        action: 'status_changed',
        entity_type: 'external_account_deletion_request',
        entity_id: id,
        metadata: {
          previous_status: current.status,
          new_status: input.status,
          ownership_verification: input.ownership_verification ?? null,
        },
      },
    });
  });
  return getExternalDeletionRequest(id);
}
