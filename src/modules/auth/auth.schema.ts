import { z } from 'zod';

export const RegisterSchema = z.object({
  phone: z
    .string()
    .regex(/^\+994[0-9]{9}$/, 'Telefon formatı: +994XXXXXXXXX'),
  role: z.enum(['company', 'worker']), // super_admin manual olaraq DB-də yaradılır
  name: z.string().min(2).max(100),
});

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(/^\+994[0-9]{9}$/),
  otp_code: z.string().length(6),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(1),
});

export const FcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
