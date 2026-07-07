import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Role } from '../../types/prisma';
import { CreateOrderInput } from './orders.schema';

export type NormalizedOrderCategoryItem = {
  category: string;
  department_id?: string;
  subdepartment_id?: string;
  position_id?: string;
  required_count: number;
  notes?: string;
};

export type CreateOrderForPersistence = Omit<
  CreateOrderInput,
  'category' | 'required_count' | 'category_items'
> & {
  category: string;
  required_count: number;
  category_items: NormalizedOrderCategoryItem[];
};

const companySummarySelect = {
  id: true,
  name: true,
  status: true,
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
} satisfies Prisma.CompanySelect;

const departmentSummarySelect = {
  id: true,
  slug: true,
  name_az: true,
  name_en: true,
  status: true,
} satisfies Prisma.DepartmentSelect;

const subdepartmentSummarySelect = {
  id: true,
  slug: true,
  department_id: true,
  name_az: true,
  name_en: true,
  status: true,
} satisfies Prisma.SubdepartmentSelect;

const positionSummarySelect = {
  id: true,
  slug: true,
  subdepartment_id: true,
  name_az: true,
  name_en: true,
  status: true,
  subdepartment: {
    select: {
      ...subdepartmentSummarySelect,
      department: { select: departmentSummarySelect },
    },
  },
} satisfies Prisma.PositionSelect;

export const orderCategoryItemSelect = {
  id: true,
  category: true,
  department_id: true,
  subdepartment_id: true,
  position_id: true,
  required_count: true,
  notes: true,
  department: { select: departmentSummarySelect },
  subdepartment: { select: subdepartmentSummarySelect },
  position: { select: positionSummarySelect },
} satisfies Prisma.OrderCategoryItemSelect;

export const orderListInclude = {
  company: { select: companySummarySelect },
  category_items: {
    where: { deleted_at: null },
    select: orderCategoryItemSelect,
    orderBy: { created_at: 'asc' },
  },
  assignments: {
    where: { deleted_at: null },
    select: {
      id: true,
      status: true,
      order_category_item_id: true,
      assigned_category: true,
      position_id: true,
    },
  },
  _count: { select: { assignments: true, ratings: true } },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  company: { select: companySummarySelect },
  assignments: {
    where: { deleted_at: null },
    select: {
      id: true,
      worker_id: true,
      order_category_item_id: true,
      assigned_category: true,
      status: true,
      assigned_at: true,
      updated_at: true,
      order_category_item: {
        select: orderCategoryItemSelect,
      },
    },
    orderBy: { assigned_at: 'desc' },
  },
  category_items: {
    where: { deleted_at: null },
    select: orderCategoryItemSelect,
    orderBy: { created_at: 'asc' },
  },
  _count: { select: { assignments: true, ratings: true } },
} satisfies Prisma.OrderInclude;

export function findCompanyByUserId(userId: string) {
  return prisma.company.findUnique({
    where: { user_id: userId },
    include: { user: { select: { id: true, name: true, phone: true } } },
  });
}

export function findOrderById(id: string) {
  return prisma.order.findFirst({
    where: { id, deleted_at: null },
    include: orderDetailInclude,
  });
}

export function findOrderByIdForCompany(id: string, companyId: string) {
  return prisma.order.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
    include: orderDetailInclude,
  });
}

export async function listOrders(input: {
  where: Prisma.OrderWhereInput;
  page: number;
  limit: number;
  sort: 'asc' | 'desc';
}) {
  const [total, data] = await prisma.$transaction([
    prisma.order.count({ where: input.where }),
    prisma.order.findMany({
      where: input.where,
      include: orderListInclude,
      orderBy: { created_at: input.sort },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return { total, data };
}

export function createOrderWithSideEffects(input: {
  actorId: string;
  actorRole: Role;
  companyId: string;
  companyName: string;
  order: CreateOrderForPersistence;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.create({
      data: {
        company_id: input.companyId,
        title: input.order.title,
        description: input.order.description,
        category: input.order.category,
        shift_start: input.order.start_datetime,
        shift_end: input.order.end_datetime,
        required_count: input.order.required_count,
        required_skills: input.order.required_skills ?? [],
        location: input.order.location,
        pay_rate: input.order.pay_rate,
        notes: input.order.notes,
        status: 'active',
        category_items: {
          create: input.order.category_items.map((item) => ({
            category: item.category,
            department_id: item.department_id,
            subdepartment_id: item.subdepartment_id,
            position_id: item.position_id,
            required_count: item.required_count,
            notes: item.notes,
          })),
        },
      },
      include: orderDetailInclude,
    });

    await tx.auditLog.create({
      data: {
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: 'order_created',
        entity_type: 'order',
        entity_id: order.id,
        metadata: {
          company_id: input.companyId,
          company_name: input.companyName,
          required_count: input.order.required_count,
          category_items: input.order.category_items,
          start_datetime: input.order.start_datetime.toISOString(),
          end_datetime: input.order.end_datetime.toISOString(),
        },
      },
    });

    const admins = await tx.user.findMany({
      where: { role: 'super_admin', is_active: true, deleted_at: null },
      select: { id: true },
    });

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          recipient_id: admin.id,
          type: 'order_created',
          title: 'Yeni sifariş yaradıldı',
          body: `${input.companyName} "${input.order.title}" sifarişini yaratdı.`,
          metadata: {
            order_id: order.id,
            company_id: input.companyId,
            required_count: input.order.required_count,
            category_items: input.order.category_items,
          },
        })),
      });
    }

    return order;
  });
}

export function cancelCompanyOrderWithAudit(input: {
  orderId: string;
  companyId: string;
  actorId: string;
  actorRole: Role;
  previousStatus: string;
  reason?: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.order.updateMany({
      where: {
        id: input.orderId,
        company_id: input.companyId,
        deleted_at: null,
        status: { notIn: ['cancelled', 'completed'] },
      },
      data: {
        status: 'cancelled',
      },
    });

    if (result.count !== 1) return null;

    const order = await tx.order.findFirst({
      where: { id: input.orderId, company_id: input.companyId, deleted_at: null },
      include: orderDetailInclude,
    });
    if (!order) return null;

    await tx.auditLog.create({
      data: {
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: 'order_cancelled',
        entity_type: 'order',
        entity_id: input.orderId,
        metadata: {
          previous_status: input.previousStatus,
          new_status: order.status,
          reason: input.reason,
        },
      },
    });

    return order;
  });
}
