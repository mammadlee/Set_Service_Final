import { z } from 'zod';
import { normalizeOptionalDateFilter } from '../../lib/date-filters';
import { ORDER_STATUSES } from '../orders/orders.schema';

const optionalStartDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'start'),
  z.coerce.date().optional(),
);

const optionalEndDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'end'),
  z.coerce.date().optional(),
);

export const CompanyReportParamsSchema = z.object({
  companyId: z.string().uuid(),
});

const CompanyReportQueryObject = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    start_date: optionalStartDate,
    end_date: optionalEndDate,
    order_status: z.enum(ORDER_STATUSES).optional(),
    worker_id: z.string().uuid().optional(),
    position_id: z.string().uuid().optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
  }).strict();

const validateDateRange = (
  value: { start_date?: Date; end_date?: Date },
  ctx: z.RefinementCtx,
) => {
  if (value.start_date && value.end_date && value.end_date < value.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'end_date must be after start_date',
    });
  }
};

export const CompanyReportQuerySchema = CompanyReportQueryObject
  .superRefine((value, ctx) => {
    validateDateRange(value, ctx);
  });

export const CompanyReportExportQuerySchema = CompanyReportQueryObject.omit({
  page: true,
  limit: true,
}).extend({
  format: z.enum(['csv']).default('csv'),
}).strict().superRefine(validateDateRange);

export type CompanyReportQueryInput = z.infer<typeof CompanyReportQuerySchema>;
export type CompanyReportExportQueryInput = z.infer<typeof CompanyReportExportQuerySchema>;
