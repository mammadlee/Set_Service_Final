import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPush } from '../../lib/fcm';
import { CompanyStatus, Role } from '../../types/prisma';

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
    include: { user: { select: { name: true, phone: true } } },
  });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company must be approved before using company APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }
  return toCompanyProfile(company);
}

export async function updateMyCompany(userId: string, data: { name?: string; docs_url?: string; documents?: unknown }) {
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company || company.deleted_at) throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company must be approved before using company APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }

  const updated = await prisma.company.update({
    where: { user_id: userId },
    data,
    include: { user: { select: { name: true, phone: true } } },
  });
  return toCompanyProfile(updated);
}

export async function listCompanies(filters: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: 'asc' | 'desc';
}) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 100);
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
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: filters.sort ?? 'desc' },
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
    include: { user: { select: { name: true, phone: true } } },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');
  return toCompanyProfile(company);
}

export async function approveCompany(id: string, actor: { sub: string; role: string }) {
  const company = await prisma.company.findFirst({
    where: { id, deleted_at: null },
    include: { user: true },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedCompany = await tx.company.update({
      where: { id },
      data: {
        status: 'approved' as CompanyStatus,
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
        title: 'Company approved',
        body: 'Your company account has been approved.',
        metadata: { company_id: id },
      },
    });

    return updatedCompany;
  });

  if (company.user.fcm_token) {
    await sendPush(company.user.fcm_token, {
      title: 'Company approved',
      body: 'You can now create job requests.',
    });
  }

  return toCompanyProfile(updated);
}

export async function rejectCompany(id: string, reason: string, actor: { sub: string; role: string }) {
  const company = await prisma.company.findFirst({
    where: { id, deleted_at: null },
    include: { user: true },
  });
  if (!company) throw Errors.notFound('Company not found.', 'COMPANY_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedCompany = await tx.company.update({
      where: { id },
      data: {
        status: 'rejected' as CompanyStatus,
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
        title: 'Company rejected',
        body: 'Your company account was rejected.',
        metadata: { company_id: id, reason },
      },
    });

    return updatedCompany;
  });

  if (company.user.fcm_token) {
    await sendPush(company.user.fcm_token, {
      title: 'Company rejected',
      body: `Reason: ${reason}`,
    });
  }

  return toCompanyProfile(updated);
}

function toCompanyProfile(company: {
  id: string;
  user_id: string;
  user: { name: string; phone: string };
  name: string;
  status: string;
  docs_url?: string | null;
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
    status: company.status,
    docs_url: company.docs_url,
    documents: company.documents,
    reject_reason: company.reject_reason,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}
