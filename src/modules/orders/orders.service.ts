import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { ORDER_IDEMPOTENCY_TTL_MS } from '../../lib/idempotency';
import { Role } from '../../types/prisma';
import {
  CancelOrderInput,
  CreateOrderInput,
  ListOrdersQueryInput,
} from './orders.schema';
import * as OrdersRepository from './orders.repository';
import { assertOrderTransition } from './orders.state-machine';
import * as TaxonomyService from '../taxonomy/taxonomy.service';

type OrderRecord = NonNullable<Awaited<ReturnType<typeof OrdersRepository.findOrderById>>>;
type OrderListRecord = Awaited<ReturnType<typeof OrdersRepository.listOrders>>['data'][number];
type OrderResponseSource = OrderRecord | OrderListRecord;
type CompanyRecord = NonNullable<Awaited<ReturnType<typeof OrdersRepository.findCompanyByUserId>>>;
type OrderCategoryItemSummarySource = {
  id: string | null;
  category: string;
  department_id?: string | null;
  subdepartment_id?: string | null;
  position_id?: string | null;
  required_count: number;
  notes: string | null;
  department?: TaxonomySummarySource | null;
  subdepartment?: (TaxonomySummarySource & { department_id?: string }) | null;
  position?: PositionSummarySource | null;
};
type OrderAssignmentSummarySource = {
  status: string;
  order_category_item_id: string | null;
  assigned_category: string | null;
  position_id?: string | null;
};
type TaxonomySummarySource = {
  id: string;
  slug: string;
  name_az: string;
  name_en: string | null;
  status: string;
};
type PositionSummarySource = TaxonomySummarySource & {
  subdepartment_id: string;
  subdepartment?: (TaxonomySummarySource & {
    department_id: string;
    department?: TaxonomySummarySource | null;
  }) | null;
};
const OCCUPYING_ASSIGNMENT_STATUSES = new Set(['assigned', 'accepted', 'completed']);

export async function listOrders(userId: string, roleValue: string, filters: ListOrdersQueryInput) {
  const role = parseRole(roleValue);
  const where: Prisma.OrderWhereInput = { deleted_at: null };

  if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    where.company_id = company.id;
  } else if (role !== 'super_admin' && role !== 'admin') {
    throw Errors.forbidden('Workers cannot list orders.', 'ROLE_FORBIDDEN');
  }

  if (filters.status) where.status = filters.status;
  const andFilters: Prisma.OrderWhereInput[] = [];
  if (filters.category) {
    andFilters.push({
      OR: [
        { category: { equals: filters.category, mode: 'insensitive' } },
        {
          category_items: {
            some: {
              category: { equals: filters.category, mode: 'insensitive' },
              deleted_at: null,
            },
          },
        },
      ],
    });
  }
  if (filters.department_id) {
    andFilters.push({
      category_items: {
        some: {
          department_id: filters.department_id,
          deleted_at: null,
        },
      },
    });
  }
  if (filters.subdepartment_id) {
    andFilters.push({
      category_items: {
        some: {
          subdepartment_id: filters.subdepartment_id,
          deleted_at: null,
        },
      },
    });
  }
  if (filters.position_id) {
    andFilters.push({
      category_items: {
        some: {
          position_id: filters.position_id,
          deleted_at: null,
        },
      },
    });
  }
  if (filters.search) {
    andFilters.push({
      OR: [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
        { company: { name: { contains: filters.search, mode: 'insensitive' } } },
        {
          category_items: {
            some: {
              category: { contains: filters.search, mode: 'insensitive' },
              deleted_at: null,
            },
          },
        },
      ],
    });
  }
  if (andFilters.length > 0) where.AND = andFilters;

  const { data, total } = await OrdersRepository.listOrders({
    where,
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort,
  });

  return {
    data: data.map((order) => toOrderResponse(order)),
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: Math.ceil(total / filters.limit),
    },
  };
}

export async function createOrder(
  userId: string,
  roleValue: string,
  input: CreateOrderInput,
  idempotencyKey?: string
) {
  const role = parseRole(roleValue);
  if (role !== 'company') {
    throw Errors.forbidden('Only approved companies can create orders.', 'ROLE_FORBIDDEN');
  }

  validateOrderWindow(input.start_datetime, input.end_datetime);
  const company = await getApprovedCompanyForUser(userId);
  const orderInput = await normalizeOrderInput(input);

  const result = await OrdersRepository.createOrderWithSideEffects({
    actorId: userId,
    actorRole: role,
    companyId: company.id,
    companyName: company.name,
    order: orderInput,
    idempotency: idempotencyKey
      ? {
          actorId: userId,
          scope: 'orders.create',
          key: idempotencyKey,
          requestHash: hashOrderRequest(orderInput),
          expiresAt: new Date(Date.now() + ORDER_IDEMPOTENCY_TTL_MS),
        }
      : undefined,
    buildResponse: (order) =>
      JSON.parse(JSON.stringify(toOrderResponse(order))) as Prisma.InputJsonValue,
  });

  return { response: result.response, replayed: result.replayed };
}

export async function getOrder(id: string, userId: string, roleValue: string) {
  const role = parseRole(roleValue);
  let order: OrderRecord | null;

  if (role === 'super_admin' || role === 'admin') {
    order = await OrdersRepository.findOrderById(id);
  } else if (role === 'company') {
    const company = await getApprovedCompanyForUser(userId);
    order = await OrdersRepository.findOrderByIdForCompany(id, company.id);
  } else {
    throw Errors.forbidden('Workers cannot access company orders.', 'ROLE_FORBIDDEN');
  }

  if (!order) throw Errors.notFound('Order not found.', 'ORDER_NOT_FOUND');
  return toOrderResponse(order, { includeAssignments: true });
}

export async function cancelOrder(id: string, userId: string, roleValue: string, input: CancelOrderInput) {
  const role = parseRole(roleValue);
  if (role !== 'company') {
    throw Errors.forbidden('Only the company owner can cancel an order.', 'ROLE_FORBIDDEN');
  }

  const company = await getApprovedCompanyForUser(userId);
  const order = await OrdersRepository.findOrderByIdForCompany(id, company.id);
  if (!order) throw Errors.notFound('Order not found.', 'ORDER_NOT_FOUND');

  if (input.expected_version !== undefined && input.expected_version !== order.version) {
    throw Errors.conflict(
      'Order version is stale. Refresh the order and retry.',
      'ORDER_VERSION_CONFLICT',
      { expected_version: input.expected_version, current_version: order.version },
    );
  }
  if (order.status === 'cancelled') {
    throw Errors.conflict('Order is already cancelled.', 'ORDER_ALREADY_CANCELLED');
  }
  if (order.status === 'completed') {
    throw Errors.badRequest('Completed orders cannot be cancelled.', 'ORDER_ALREADY_COMPLETED');
  }
  assertOrderTransition(order.status, 'cancelled');

  const updated = await OrdersRepository.cancelCompanyOrderWithAudit({
    orderId: id,
    companyId: company.id,
    actorId: userId,
    actorRole: role,
    previousStatus: order.status,
    expectedVersion: order.version,
    reason: input.reason,
  });

  if (!updated) {
    const latest = await OrdersRepository.findOrderByIdForCompany(id, company.id);
    if (
      input.expected_version !== undefined
      && latest
      && latest.version !== input.expected_version
    ) {
      throw Errors.conflict(
        'Order version is stale. Refresh the order and retry.',
        'ORDER_VERSION_CONFLICT',
        { expected_version: input.expected_version, current_version: latest.version },
      );
    }
    if (latest?.status === 'cancelled') {
      throw Errors.conflict('Order is already cancelled.', 'ORDER_ALREADY_CANCELLED');
    }
    if (latest?.status === 'completed') {
      throw Errors.badRequest('Completed orders cannot be cancelled.', 'ORDER_ALREADY_COMPLETED');
    }
    throw Errors.conflict('Order could not be cancelled because it changed. Please retry.', 'ORDER_CANCEL_CONFLICT');
  }

  return toOrderResponse(updated.order, { includeAssignments: true });
}

export function hashOrderRequest(input: OrdersRepository.CreateOrderForPersistence): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function validateOrderWindow(start: Date, end: Date): void {
  if (start.getTime() <= Date.now()) {
    throw Errors.badRequest('start_datetime must be in the future.', 'INVALID_ORDER_START');
  }
  if (end.getTime() <= start.getTime()) {
    throw Errors.badRequest('end_datetime must be after start_datetime.', 'INVALID_ORDER_END');
  }
}

async function normalizeOrderInput(input: CreateOrderInput): Promise<OrdersRepository.CreateOrderForPersistence> {
  const positionIds = input.category_items
    ?.map((item) => item.position_id)
    .filter((positionId): positionId is string => Boolean(positionId)) ?? [];
  const positions = await TaxonomyService.findActivePositionsByIds(positionIds);
  const positionsById = new Map(positions.map((position) => [position.id, position]));

  if (positionsById.size !== new Set(positionIds).size) {
    throw Errors.badRequest('Vəzifə tapılmadı və ya aktiv deyil.', 'POSITION_NOT_FOUND', {
      position_ids: positionIds,
    });
  }

  const categoryItems = input.category_items?.length
    ? input.category_items.map((item) => {
        if (!item.position_id) {
          return {
            category: item.category!.trim(),
            required_count: item.required_count,
            notes: item.notes?.trim(),
          };
        }

        const position = positionsById.get(item.position_id)!;
        const subdepartmentId = position.subdepartment_id;
        const departmentId = position.subdepartment.department_id;
        if (item.department_id && item.department_id !== departmentId) {
          throw Errors.badRequest('Seçilmiş şöbə və vəzifə uyğun deyil.', 'POSITION_DEPARTMENT_MISMATCH', {
            department_id: item.department_id,
            position_id: item.position_id,
          });
        }
        if (item.subdepartment_id && item.subdepartment_id !== subdepartmentId) {
          throw Errors.badRequest('Seçilmiş departament və vəzifə uyğun deyil.', 'POSITION_SUBDEPARTMENT_MISMATCH', {
            subdepartment_id: item.subdepartment_id,
            position_id: item.position_id,
          });
        }

        return {
          category: item.category?.trim() || position.name_az,
          department_id: departmentId,
          subdepartment_id: subdepartmentId,
          position_id: position.id,
          required_count: item.required_count,
          notes: item.notes?.trim(),
        };
      })
    : [
        {
          category: input.category!.trim(),
          required_count: input.required_count!,
          notes: undefined,
        },
      ];

  const requiredCount = categoryItems.reduce((sum, item) => sum + item.required_count, 0);

  return {
    ...input,
    category: input.category?.trim() || categoryItems[0].category,
    required_count: requiredCount,
    category_items: categoryItems,
  };
}

async function getApprovedCompanyForUser(userId: string): Promise<CompanyRecord> {
  const company = await OrdersRepository.findCompanyByUserId(userId);
  if (!company || company.deleted_at) {
    throw Errors.notFound('Company profile not found.', 'COMPANY_NOT_FOUND');
  }
  if (company.status !== 'approved') {
    throw Errors.forbidden('Company account must be approved before using order APIs.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }
  return company;
}

function parseRole(role: string): Role {
  if (role === 'super_admin' || role === 'admin' || role === 'company' || role === 'worker') return role;
  throw Errors.forbidden('Account role is not supported.', 'ROLE_FORBIDDEN');
}

function toOrderResponse(order: OrderResponseSource, options: { includeAssignments?: boolean } = {}) {
  const categoryItems = toOrderCategoryItems(order);

  return {
    id: order.id,
    company_id: order.company_id,
    company: order.company
      ? {
          id: order.company.id,
          name: order.company.name,
          status: order.company.status,
          contact_name: order.company.user.name,
          phone: order.company.user.phone,
        }
      : undefined,
    title: order.title,
    description: order.description,
    category: order.category,
    category_items: categoryItems,
    required_count: order.required_count,
    required_skills: order.required_skills,
    start_datetime: order.shift_start,
    end_datetime: order.shift_end,
    location: order.location,
    pay_rate: serializePayRate(order.pay_rate),
    notes: order.notes,
    status: order.status,
    version: order.version,
    assignment_count: order._count?.assignments ?? 0,
    rating_count: order._count?.ratings ?? 0,
    assignments: options.includeAssignments ? order.assignments : undefined,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function toOrderCategoryItems(order: OrderResponseSource) {
  const orderCategoryItems = order.category_items as OrderCategoryItemSummarySource[];
  const orderAssignments = order.assignments as OrderAssignmentSummarySource[];
  const sourceItems: OrderCategoryItemSummarySource[] = orderCategoryItems.length
    ? orderCategoryItems
    : [
        {
          id: null,
          category: order.category,
          department_id: null,
          subdepartment_id: null,
          position_id: null,
          required_count: order.required_count,
          notes: null,
          department: null,
          subdepartment: null,
          position: null,
        },
      ];

  return sourceItems.map((item: OrderCategoryItemSummarySource) => {
    const assignedCount = orderAssignments.filter((assignment: OrderAssignmentSummarySource) => {
      if (!OCCUPYING_ASSIGNMENT_STATUSES.has(assignment.status)) return false;
      if (item.id) return assignment.order_category_item_id === item.id;
      return !assignment.order_category_item_id && (assignment.assigned_category ?? order.category) === item.category;
    }).length;

    return {
      id: item.id,
      category: item.category,
      department_id: item.department_id ?? item.position?.subdepartment?.department?.id ?? null,
      subdepartment_id: item.subdepartment_id ?? item.position?.subdepartment_id ?? null,
      position_id: item.position_id ?? item.position?.id ?? null,
      department: toTaxonomySummary(item.department ?? item.position?.subdepartment?.department ?? null),
      subdepartment: toTaxonomySummary(item.subdepartment ?? item.position?.subdepartment ?? null),
      position: toPositionSummary(item.position ?? null),
      required_count: item.required_count,
      assigned_count: assignedCount,
      remaining_count: Math.max(0, item.required_count - assignedCount),
      notes: item.notes,
    };
  });
}

function toTaxonomySummary(item: TaxonomySummarySource | null | undefined) {
  if (!item) return null;
  return {
    id: item.id,
    slug: item.slug,
    name_az: item.name_az,
    name_en: item.name_en,
    status: item.status,
  };
}

function toPositionSummary(item: PositionSummarySource | null | undefined) {
  if (!item) return null;
  return {
    ...toTaxonomySummary(item)!,
    subdepartment_id: item.subdepartment_id,
    department_id: item.subdepartment?.department?.id ?? item.subdepartment?.department_id ?? null,
  };
}

function serializePayRate(payRate: Prisma.Decimal | null): number | null {
  return payRate === null ? null : Number(payRate);
}
