import { z } from 'zod';

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

export const ActivateVenueKioskSchema = z
  .object({
    order_id: z.string().uuid(),
    expires_at: z.string().datetime().optional(),
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

export const ListAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  assignment_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  worker_id: z.string().uuid().optional(),
  open_only: z.coerce.boolean().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type GenerateQrTokenInput = z.infer<typeof GenerateQrTokenSchema>;
export type CreateKioskSessionInput = z.infer<typeof CreateKioskSessionSchema>;
export type CreateVenueKioskInput = z.infer<typeof CreateVenueKioskSchema>;
export type ListVenueKiosksQueryInput = z.infer<typeof ListVenueKiosksQuerySchema>;
export type ActivateVenueKioskInput = z.infer<typeof ActivateVenueKioskSchema>;
export type CheckInInput = z.infer<typeof CheckInSchema>;
export type CheckOutInput = z.infer<typeof CheckOutSchema>;
export type ListAttendanceQueryInput = z.infer<typeof ListAttendanceQuerySchema>;
