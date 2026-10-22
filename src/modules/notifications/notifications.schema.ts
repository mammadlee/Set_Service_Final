import { z } from 'zod';

const booleanQuery = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean().optional());

export const NotificationListQuerySchema = z
  .object({
    page: z.coerce.number().finite().int().min(1).default(1),
    limit: z.coerce.number().finite().int().min(1).max(100).default(20),
    unread_only: booleanQuery.default(false),
  })
  .strict();

export const NotificationIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
