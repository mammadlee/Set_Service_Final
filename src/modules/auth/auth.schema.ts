import { z } from 'zod';

export const PhoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be E.164, for example +994501234567'));

export const SkillSchema = z.union([
  z.string().min(1).max(80),
  z.object({
    name: z.string().min(1).max(80),
    level: z.number().int().min(1).max(5).optional(),
  }),
]);

export const DocumentSchema = z.object({
  type: z.string().min(1).max(80),
  url: z.string().url(),
  name: z.string().min(1).max(160).optional(),
}).passthrough();

export const WorkerRegisterSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: PhoneSchema,
  position: z.string().min(2).max(120),
  skills: z.array(SkillSchema).default([]),
  languages: z.array(z.string().min(1).max(40)).default([]),
  documents: z.array(DocumentSchema).default([]),
});

export const WorkerRequestOtpSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(['worker_registration', 'worker_login']).optional(),
});

export const WorkerLoginSchema = z.object({
  phone: PhoneSchema,
});

export const CompanyRegisterSchema = z.object({
  name: z.string().min(2).max(200),
  contact_name: z.string().min(2).max(120),
  phone: PhoneSchema,
  docs_url: z.string().url().optional(),
  documents: z.array(DocumentSchema).default([]),
});

export const CompanyLoginSchema = z.object({
  phone: PhoneSchema,
});

export const AdminLoginSchema = z.object({
  phone: PhoneSchema,
});

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  otp_code: z.string().regex(/^\d{6}$/),
  purpose: z.enum([
    'worker_registration',
    'worker_login',
    'company_registration',
    'company_login',
    'admin_login',
  ]).optional(),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(20),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(20),
});

export const FcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
});

// Compatibility for the old /auth/register route. New clients should use
// /auth/worker/register or /auth/company/register.
export const RegisterSchema = z.union([
  z.object({
    role: z.literal('worker'),
    phone: PhoneSchema,
    name: z.string().min(2).max(120).optional(),
    full_name: z.string().min(2).max(120).optional(),
    position: z.string().min(2).max(120).default('Worker'),
    skills: z.array(SkillSchema).default([]),
    languages: z.array(z.string().min(1).max(40)).default([]),
    documents: z.array(DocumentSchema).default([]),
  }).refine((input) => Boolean(input.full_name ?? input.name), {
    message: 'Either full_name or name is required',
    path: ['full_name'],
  }).transform((input) => ({
    ...input,
    full_name: input.full_name ?? input.name ?? '',
  })),
  z.object({
    role: z.literal('company'),
    phone: PhoneSchema,
    name: z.string().min(2).max(200),
    contact_name: z.string().min(2).max(120).optional(),
    docs_url: z.string().url().optional(),
    documents: z.array(DocumentSchema).default([]),
  }).transform((input) => ({
    ...input,
    contact_name: input.contact_name ?? input.name,
  })),
]);

export type WorkerRegisterInput = z.infer<typeof WorkerRegisterSchema>;
export type WorkerRequestOtpInput = z.infer<typeof WorkerRequestOtpSchema>;
export type WorkerLoginInput = z.infer<typeof WorkerLoginSchema>;
export type CompanyRegisterInput = z.infer<typeof CompanyRegisterSchema>;
export type CompanyLoginInput = z.infer<typeof CompanyLoginSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
