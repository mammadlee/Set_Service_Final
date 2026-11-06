import { z } from 'zod';
import { normalizeOptionalDateFilter } from '../../lib/date-filters';

export const ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'rejected', 'completed', 'cancelled'] as const;

export const ASSIGNMENT_HISTORY_SCOPES = ['active', 'history'] as const;

const AssignmentRequestSchema = z
  .object({
    worker_id: z.string().uuid(),
    category: z.string().trim().min(2).max(100).optional(),
    order_category_item_id: z.string().uuid().optional(),
    position_id: z.string().uuid().optional(),
  })
  .strict();

const assignmentCreateShape = {
  order_id: z.string().uuid(),
  worker_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  order_category_item_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
  assignments: z.array(AssignmentRequestSchema).min(1).max(100).optional(),
};

export const CreateAssignmentsSchema = z
  .object(assignmentCreateShape)
  .strict()
  .refine((value) => value.worker_ids?.length || value.assignments?.length, {
    message: 'worker_ids or assignments is required',
    path: ['worker_ids'],
  });

// Bulk creation deliberately permits repeated worker ids at validation time so
// every submitted row can receive its own deterministic success/failure result.
export const BulkCreateAssignmentsSchema = z
  .object(assignmentCreateShape)
  .strict()
  .refine((value) => value.worker_ids?.length || value.assignments?.length, {
    message: 'worker_ids or assignments is required',
    path: ['worker_ids'],
  });

const optionalStartDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'start'),
  z.coerce.date().optional(),
);
const optionalEndDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'end'),
  z.coerce.date().optional(),
);

export const ListAssignmentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    scope: z.enum(ASSIGNMENT_HISTORY_SCOPES).optional(),
    status: z.enum(ASSIGNMENT_STATUSES).optional(),
    company_id: z.string().uuid().optional(),
    order_id: z.string().uuid().optional(),
    worker_id: z.string().uuid().optional(),
    worker_search: z.string().trim().min(1).max(120).optional(),
    position_id: z.string().uuid().optional(),
    start_date: optionalStartDate,
    end_date: optionalEndDate,
    sort: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_date'],
        message: 'end_date must be after start_date',
      });
    }
    if (value.scope === 'active' && value.status && !['assigned', 'accepted'].includes(value.status)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'status is not part of the active assignment scope',
      });
    }
    if (value.scope === 'history' && value.status && !['rejected', 'completed', 'cancelled'].includes(value.status)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'status is not part of the historical assignment scope',
      });
    }
  });

export const AssignmentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const CancelAssignmentSchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .default({});

export type CreateAssignmentsInput = z.infer<typeof CreateAssignmentsSchema>;
export type BulkCreateAssignmentsInput = z.infer<typeof BulkCreateAssignmentsSchema>;
export type ListAssignmentsQueryInput = z.infer<typeof ListAssignmentsQuerySchema>;
export type CancelAssignmentInput = z.infer<typeof CancelAssignmentSchema>;
