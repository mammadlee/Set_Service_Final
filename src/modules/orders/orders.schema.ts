import { z } from 'zod';

export const ORDER_STATUSES = [
  'draft',
  'active',
  'published',
  'partially_assigned',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
const DUPLICATE_CATEGORY_MESSAGE = 'Eyni kateqoriya bir sifarişdə təkrar seçilə bilməz.';

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional()
  );

const OrderCategoryItemSchema = z
  .object({
    department_id: z.string().uuid().optional(),
    subdepartment_id: z.string().uuid().optional(),
    position_id: z.string().uuid().optional(),
    category: z.string().trim().min(2).max(100).optional(),
    required_count: z.coerce.number().int().positive().max(500),
    notes: optionalTrimmedString(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.position_id && !value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['position_id'],
        message: 'position_id or legacy category is required',
      });
    }
  });

export const CreateOrderSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(5000),
    category: z.string().trim().min(2).max(100).optional(),
    required_count: z.coerce.number().int().positive().max(500).optional(),
    category_items: z.array(OrderCategoryItemSchema).min(1).max(25).optional(),
    start_datetime: z.coerce.date(),
    end_datetime: z.coerce.date(),
    location: z.string().trim().min(2).max(250),
    pay_rate: z.coerce.number().positive().max(1_000_000).optional(),
    required_skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    notes: optionalTrimmedString(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const now = Date.now();
    const start = value.start_datetime.getTime();
    const end = value.end_datetime.getTime();

    if (start <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['start_datetime'],
        message: 'start_datetime must be in the future',
      });
    }

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_datetime'],
        message: 'end_datetime must be after start_datetime',
      });
    }

    if (!value.category_items && (!value.category || !value.required_count)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category_items'],
        message: 'category_items or legacy category + required_count is required',
      });
    }

    if (value.category_items?.length) {
      const categories = value.category_items
        .map((item) => item.position_id ?? item.category?.trim().toLocaleLowerCase('az-AZ'))
        .filter((category): category is string => Boolean(category));
      if (new Set(categories).size !== categories.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['category_items'],
          message: DUPLICATE_CATEGORY_MESSAGE,
        });
      }
    }
  });

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  category: optionalTrimmedString(100),
  department_id: z.string().uuid().optional(),
  subdepartment_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
  search: optionalTrimmedString(200),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export const OrderIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Idempotency-Key contains unsupported characters');

export const CancelOrderSchema = z
  .object({
    reason: optionalTrimmedString(500),
    expected_version: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .default({});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type ListOrdersQueryInput = z.infer<typeof ListOrdersQuerySchema>;
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;
