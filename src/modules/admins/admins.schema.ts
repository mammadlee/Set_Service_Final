import { z } from 'zod';
import { EmailSchema, PasswordSchema } from '../auth/auth.schema';
import { ADMIN_PERMISSIONS } from './admins.permissions';

export const AdminPermissionSchema = z.enum(ADMIN_PERMISSIONS);

export const CreateAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: EmailSchema,
  password: PasswordSchema,
  is_active: z.boolean().default(true),
  permissions: z.array(AdminPermissionSchema).min(1, 'Admin üçün ən azı bir icazə seçilməlidir.'),
});

export const UpdateAdminSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: EmailSchema.optional(),
  password: PasswordSchema.optional(),
  is_active: z.boolean().optional(),
  permissions: z.array(AdminPermissionSchema).optional(),
});

export const AdminIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;
export type UpdateAdminInput = z.infer<typeof UpdateAdminSchema>;
