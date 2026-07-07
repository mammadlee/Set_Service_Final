import { z } from 'zod';

export const ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'rejected', 'completed', 'cancelled'] as const;

export const CreateAssignmentsSchema = z
  .object({
    order_id: z.string().uuid(),
    worker_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
    category: z.string().trim().min(2).max(100).optional(),
    order_category_item_id: z.string().uuid().optional(),
    position_id: z.string().uuid().optional(),
    assignments: z
      .array(
        z
          .object({
            worker_id: z.string().uuid(),
            category: z.string().trim().min(2).max(100).optional(),
            order_category_item_id: z.string().uuid().optional(),
            position_id: z.string().uuid().optional(),
          })
          .strict()
      )
      .min(1)
      .max(100)
      .optional(),
  })
  .strict()
  .refine((value) => value.worker_ids?.length || value.assignments?.length, {
    message: 'worker_ids or assignments is required',
    path: ['worker_ids'],
  });

export const ListAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  order_id: z.string().uuid().optional(),
  worker_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
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
export type ListAssignmentsQueryInput = z.infer<typeof ListAssignmentsQuerySchema>;
export type CancelAssignmentInput = z.infer<typeof CancelAssignmentSchema>;
