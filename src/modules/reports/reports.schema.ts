import { z } from 'zod';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const optionalStartDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.date().optional()
);

const optionalEndDate = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (dateOnlyPattern.test(trimmed)) return `${trimmed}T23:59:59.999Z`;
    return trimmed;
  },
  z.coerce.date().optional()
);

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional()
  );

export const ReportQuerySchema = z
  .object({
    start_date: optionalStartDate,
    end_date: optionalEndDate,
    company_id: z.string().uuid().optional(),
    worker_id: z.string().uuid().optional(),
    category: optionalTrimmedString(100),
    department_id: z.string().uuid().optional(),
    subdepartment_id: z.string().uuid().optional(),
    position_id: z.string().uuid().optional(),
    foc_training: z.enum(['foc', 'non_foc']).optional(),
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
  });

export type ReportQueryInput = z.infer<typeof ReportQuerySchema>;
