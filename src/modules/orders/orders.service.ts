import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { sendPush } from '../../lib/fcm';
import { OrderStatus } from '../../types/prisma';

export async function listOrders(userId: string, role: string, filters: { status?: string; page: number; limit: number }) {
  const where: Record<string, unknown> = {};

  if (role === 'company') {
    const company = await prisma.company.findUnique({ where: { user_id: userId } });
    if (!company) throw Errors.notFound('Şirkət tapılmadı');
    where.company_id = company.id;
  } else if (role === 'worker') {
    throw Errors.forbidden('İşçi sifariş siyahısına baxa bilməz');
  }

  if (filters.status) where.status = filters.status as OrderStatus;

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { _count: { select: { assignments: true } } },
      orderBy: { created_at: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { data, total, page: filters.page };
}

export async function createOrder(userId: string, role: string, input: {
  shift_start: string; shift_end: string; required_count: number;
  required_skills?: string[]; notes?: string;
}) {
  let companyId: string;

  if (role === 'company') {
    const company = await prisma.company.findUnique({ where: { user_id: userId } });
    if (!company) throw Errors.notFound('Şirkət tapılmadı');
    if (company.status !== 'approved') {
      throw Errors.forbidden('Şirkət hələ təsdiqlənməyib');
    }
    companyId = company.id;
  } else if (role === 'super_admin') {
    throw Errors.badRequest('Admin birbaşa sifariş yaratmır');
  } else {
    throw Errors.forbidden();
  }

  const order = await prisma.order.create({
    data: {
      company_id: companyId,
      shift_start: new Date(input.shift_start),
      shift_end: new Date(input.shift_end),
      required_count: input.required_count,
      required_skills: input.required_skills ?? [],
      notes: input.notes,
      status: 'active',
    },
  });

  // Super admin-ə bildiriş
  const admins = await prisma.user.findMany({
    where: { role: 'super_admin', fcm_token: { not: null } },
  });
  for (const admin of admins) {
    if (admin.fcm_token) {
      await sendPush(admin.fcm_token, {
        title: 'Yeni sifariş',
        body: `${input.required_count} işçi tələb olunur`,
        data: { order_id: order.id },
      });
    }
  }

  return order;
}

export async function getOrder(id: string, userId: string, role: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { assignments: true, company: true },
  });
  if (!order) throw Errors.notFound('Sifariş tapılmadı');

  if (role === 'company') {
    const company = await prisma.company.findUnique({ where: { user_id: userId } });
    if (order.company_id !== company?.id) throw Errors.forbidden();
  }

  return order;
}

export async function cancelOrder(id: string, userId: string, role: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw Errors.notFound('Sifariş tapılmadı');

  if (role === 'company') {
    const company = await prisma.company.findUnique({ where: { user_id: userId } });
    if (order.company_id !== company?.id) throw Errors.forbidden('Yalnız öz sifarişini ləğv edə bilər');
  }

  return prisma.order.update({ where: { id }, data: { status: 'cancelled' } });
}
