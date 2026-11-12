import { z } from 'zod';
import { normalizeOptionalDateFilter } from '../../lib/date-filters';

const LocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    address: z.string().trim().min(1).max(250).optional(),
  })
  .strict()
  .refine((value) => value.latitude !== undefined || value.longitude !== undefined || value.address !== undefined, {
    message: 'location must include latitude, longitude, or address',
  });

export const GenerateQrTokenSchema = z
  .object({
    assignment_id: z.string().uuid(),
    ttl_seconds: z.coerce.number().int().min(30).max(300).optional(),
  })
  .strict();

export const CreateKioskSessionSchema = z
  .object({
    assignment_id: z.string().uuid(),
    expires_at: z.string().datetime().optional(),
  })
  .strict();

export const CreateVenueKioskSchema = z
  .object({
    company_id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(120),
    location_label: z.string().trim().min(1).max(180).optional(),
  })
  .strict();

export const ListVenueKiosksQuerySchema = z.object({
  company_id: z.string().uuid().optional(),
});

export const ListKioskEligibleOrdersQuerySchema = z
  .object({
    company_id: z.string().uuid().optional(),
  })
  .strict();

export const ActivateVenueKioskSchema = z
  .object({
    order_id: z.string().uuid(),
    expires_at: z.string().datetime().optional(),
  })
  .strict();

export const SelectVenueKioskOrderSchema = z
  .object({
    order_id: z.string().uuid(),
  })
  .strict();

export const KioskTokenParamsSchema = z.object({
  token: z.string().trim().min(32).max(256),
});

export const KioskSessionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const VenueKioskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const CheckInSchema = z
  .object({
    assignment_id: z.string().uuid().optional(),
    qr_token: z.string().trim().min(20),
    location: LocationSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const CheckOutSchema = z
  .object({
    assignment_id: z.string().uuid().optional(),
    qr_token: z.string().trim().min(20),
    location: LocationSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const AttendanceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const optionalStartDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'start'),
  z.coerce.date().optional(),
);
const optionalEndDate = z.preprocess(
  (value) => normalizeOptionalDateFilter(value, 'end'),
  z.coerce.date().optional(),
);
const optionalBoolean = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return value;
  },
  z.boolean().optional(),
);

export const ATTENDANCE_VIEW_STATUSES = [
  'not_checked_in',
  'currently_working',
  'checked_out',
  'completed',
  'missing_incomplete',
] as const;

export const ListAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  assignment_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  worker_id: z.string().uuid().optional(),
  worker_search: z.string().trim().min(1).max(120).optional(),
  position_id: z.string().uuid().optional(),
  status: z.enum(ATTENDANCE_VIEW_STATUSES).optional(),
  start_date: optionalStartDate,
  end_date: optionalEndDate,
  updated_since: z.coerce.date().optional(),
  open_only: optionalBoolean,
  sort_by: z.enum(['created_at', 'checkin_time', 'checkout_time', 'updated_at']).default('created_at'),
  sort: z.enum(['asc', 'desc']).default('desc'),
}).strict().superRefine((value, ctx) => {
  if (value.start_date && value.end_date && value.end_date < value.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'end_date must be after start_date',
    });
  }
  if (value.open_only !== undefined && value.status !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'status and open_only cannot be combined',
    });
  }
});

export type GenerateQrTokenInput = z.infer<typeof GenerateQrTokenSchema>;
export type CreateKioskSessionInput = z.infer<typeof CreateKioskSessionSchema>;
export type CreateVenueKioskInput = z.infer<typeof CreateVenueKioskSchema>;
export type ListVenueKiosksQueryInput = z.infer<typeof ListVenueKiosksQuerySchema>;
export type ListKioskEligibleOrdersQueryInput = z.infer<typeof ListKioskEligibleOrdersQuerySchema>;
export type ActivateVenueKioskInput = z.infer<typeof ActivateVenueKioskSchema>;
export type SelectVenueKioskOrderInput = z.infer<typeof SelectVenueKioskOrderSchema>;
export type CheckInInput = z.infer<typeof CheckInSchema>;
export type CheckOutInput = z.infer<typeof CheckOutSchema>;
export type ListAttendanceQueryInput = z.infer<typeof ListAttendanceQuerySchema>;
