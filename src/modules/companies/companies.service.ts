import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPush } from '../../lib/fcm';
import { CompanyStatus } from '../../types/prisma';

export async function getMyCompany(userId: string) {
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company) throw Errors.notFound('Şirkət profili tapılmadı');
  return company;
}

export async function updateMyCompany(userId: string, data: { name?: string; docs_url?: string }) {
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company) throw Errors.notFound('Şirkət profili tapılmadı');
  return prisma.company.update({ where: { user_id: userId }, data });
}

export async function listCompanies(status?: string) {
  return prisma.company.findMany({
    where: status ? { status: status as CompanyStatus } : undefined,
    include: { user: { select: { name: true, phone: true } } },
    orderBy: { created_at: 'desc' },
  });
}

export async function approveCompany(id: string, status: 'approved' | 'rejected', reason?: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!company) throw Errors.notFound('Şirkət tapılmadı');

  const updated = await prisma.company.update({
    where: { id },
    data: {
      status: status as CompanyStatus,
      reject_reason: status === 'rejected' ? (reason ?? null) : null,
    },
  });

  // Push notification
  if (company.user.fcm_token) {
    const title = status === 'approved' ? 'Hesabınız təsdiqləndi ✓' : 'Hesab təsdiqlənmədi';
    const body = status === 'approved'
      ? 'Artıq sifariş yarada bilərsiniz.'
      : `Səbəb: ${reason ?? 'Göstərilməyib'}`;
    await sendPush(company.user.fcm_token, { title, body });
  }

  return updated;
}
