import { z } from 'zod';

export const ModerationTargetTypeSchema = z.enum([
  'order',
  'company_profile',
  'worker_profile',
  'rating',
]);

export const ModerationReasonSchema = z.enum([
  'inappropriate_content',
  'harassment',
  'false_information',
  'spam',
  'privacy',
  'other',
]);

export const ModerationReportStatusSchema = z.enum([
  'open',
  'reviewing',
  'resolved',
  'dismissed',
]);

export const CreateReportSchema = z.object({
  target_type: ModerationTargetTypeSchema,
  target_id: z.string().uuid(),
  reason: ModerationReasonSchema,
  details: z.string().trim().max(1000).optional(),
}).strict();

export const ListReportsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ModerationReportStatusSchema.optional(),
}).strict();

export const ReportIdSchema = z.object({
  id: z.string().uuid(),
}).strict();

export const UpdateReportSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  resolution_note: z.string().trim().max(1000).optional(),
}).strict();

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type ListReportsInput = z.infer<typeof ListReportsSchema>;
export type UpdateReportInput = z.infer<typeof UpdateReportSchema>;
