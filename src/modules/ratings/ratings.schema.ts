import { z } from 'zod';

export const CreateRatingSchema = z
  .object({
    assignment_id: z.string().uuid().optional(),
    order_id: z.string().uuid().optional(),
    worker_id: z.string().uuid().optional(),
    score: z.coerce.number().int().min(1).max(5),
    feedback: z.string().trim().max(1000).optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => value.assignment_id || (value.order_id && value.worker_id), {
    message: 'assignment_id or order_id + worker_id is required',
  });

export const WorkerRatingsParamsSchema = z.object({
  id: z.string().uuid(),
});

export const LegacyWorkerRatingsParamsSchema = z.object({
  worker_id: z.string().uuid(),
});

export type CreateRatingInput = z.infer<typeof CreateRatingSchema>;
