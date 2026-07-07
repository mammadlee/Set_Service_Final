import { z } from 'zod';

const DISALLOWED_PASSWORDS = new Set(['admin123!', 'password123!', 'test123!']);

export const PhoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefon nömrəsi E.164 formatında olmalıdır, məsələn +994501234567'));

export const EmailSchema = z
  .string()
  .trim()
  .email('Düzgün email ünvanı daxil edin.')
  .max(254)
  .transform((value) => value.toLowerCase());

export const PasswordSchema = z
  .string()
  .min(8, 'Şifrə ən azı 8 simvol olmalıdır')
  .max(128, 'Şifrə 128 simvoldan uzun olmamalıdır')
  .regex(/[A-Za-z]/, 'Şifrədə ən azı bir hərf olmalıdır')
  .regex(/\d/, 'Şifrədə ən azı bir rəqəm olmalıdır')
  .refine((value) => !DISALLOWED_PASSWORDS.has(value.toLowerCase()), 'Bu şifrə təhlükəsizlik səbəbilə istifadə edilə bilməz');

const LoginPasswordSchema = z.string().min(1, 'Şifrə tələb olunur.').max(128);
const OtpCodeSchema = z.string().regex(/^\d{6}$/, '6 rəqəmli OTP kodu daxil edin.');
const OtpChallengeSchema = z.string().min(20).max(2048);

function requirePhoneOrEmail(
  input: { phone?: string; email?: string; method?: 'phone' | 'email' },
  ctx: z.RefinementCtx
) {
  const wantsEmail = input.method === 'email' || Boolean(input.email);
  const wantsPhone = input.method === 'phone' || Boolean(input.phone);
  if (wantsEmail && !input.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Email tələb olunur.' });
  }
  if (wantsPhone && !input.phone && !wantsEmail) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Telefon nömrəsi tələb olunur.' });
  }
  if (!wantsEmail && !wantsPhone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Telefon nömrəsi və ya email tələb olunur.' });
  }
}

function requireOtpProof(input: { otp_code?: string; otp_challenge?: string }, ctx: z.RefinementCtx) {
  if (!input.otp_code && !input.otp_challenge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['otp_code'],
      message: 'OTP kodu və ya təsdiq sessiyası tələb olunur.',
    });
  }
}

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
  position: z.string().min(2).max(120).optional(),
  position_ids: z.array(z.string().uuid()).min(1).max(20).optional(),
  skills: z.array(SkillSchema).default([]),
  languages: z.array(z.string().min(1).max(40)).default([]),
  documents: z.array(DocumentSchema).default([]),
}).superRefine((input, ctx) => {
  if (!input.position && !input.position_ids?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['position_ids'],
      message: 'Vəzifə seçimi tələb olunur',
    });
  }
});

export const WorkerRequestOtpSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(['worker_registration', 'worker_password_reset']).optional(),
});

export const WorkerLoginSchema = z.object({
  phone: PhoneSchema,
  password: LoginPasswordSchema,
});

export const WorkerCompleteRegistrationSchema = z.object({
  phone: PhoneSchema,
  otp_code: OtpCodeSchema.optional(),
  otp_challenge: OtpChallengeSchema.optional(),
  password: PasswordSchema,
}).superRefine(requireOtpProof);

export const WorkerForgotPasswordSchema = z.object({
  method: z.enum(['phone', 'email']).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
}).superRefine(requirePhoneOrEmail);

export const WorkerResetPasswordSchema = z.object({
  method: z.enum(['phone', 'email']).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
  otp_code: OtpCodeSchema.optional(),
  otp_challenge: OtpChallengeSchema.optional(),
  password: PasswordSchema,
}).superRefine(requirePhoneOrEmail).superRefine(requireOtpProof);

export const WorkerPhoneChangeRequestSchema = z.object({
  phone: PhoneSchema,
});

export const WorkerPhoneChangeConfirmSchema = z.object({
  phone: PhoneSchema,
  otp_code: z.string().regex(/^\d{6}$/),
});

export const CompanyRegisterSchema = z.object({
  name: z.string().min(2).max(200),
  contact_name: z.string().min(2).max(120),
  email: EmailSchema,
  phone: PhoneSchema,
  docs_url: z.string().url().optional(),
  documents: z.array(DocumentSchema).default([]),
});

export const CompanyLoginSchema = z.object({
  email: EmailSchema,
  password: LoginPasswordSchema,
});

export const CompanyCompleteRegistrationSchema = z.object({
  email: EmailSchema,
  otp_code: OtpCodeSchema.optional(),
  otp_challenge: OtpChallengeSchema.optional(),
  password: PasswordSchema,
}).superRefine(requireOtpProof);

export const CompanyForgotPasswordSchema = z.object({
  method: z.enum(['phone', 'email']).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
}).superRefine(requirePhoneOrEmail);

export const CompanyResetPasswordSchema = z.object({
  method: z.enum(['phone', 'email']).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
  otp_code: OtpCodeSchema.optional(),
  otp_challenge: OtpChallengeSchema.optional(),
  password: PasswordSchema,
}).superRefine(requirePhoneOrEmail).superRefine(requireOtpProof);

export const EmailVerificationRequestSchema = z.object({
  email: EmailSchema,
});

export const EmailVerificationConfirmSchema = z.object({
  otp_code: OtpCodeSchema,
});

export const AdminLoginSchema = z.object({
  email: EmailSchema,
  password: LoginPasswordSchema,
});

export const AdminForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const VerifyOtpSchema = z.object({
  method: z.enum(['phone', 'email']).optional(),
  phone: PhoneSchema.optional(),
  email: EmailSchema.optional(),
  otp_code: OtpCodeSchema,
  purpose: z.enum([
    'worker_registration',
    'worker_password_reset',
    'worker_phone_change',
    'worker_login',
    'company_registration',
    'company_password_reset',
    'company_login',
    'admin_login',
  ]).optional(),
}).superRefine(requirePhoneOrEmail);

export const RefreshSchema = z.object({
  refresh_token: z.string().min(20),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(20),
});

export const FcmTokenSchema = z.object({
  fcm_token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android', 'ios', 'web', 'unknown']).default('unknown'),
  device_id: z.string().trim().min(1).max(160).optional(),
});

export const DeleteFcmTokenSchema = z.object({
  fcm_token: z.string().trim().min(10).max(4096),
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
    position_ids: z.array(z.string().uuid()).min(1).max(20).optional(),
    skills: z.array(SkillSchema).default([]),
    languages: z.array(z.string().min(1).max(40)).default([]),
    documents: z.array(DocumentSchema).default([]),
  }).refine((input) => Boolean(input.full_name ?? input.name), {
    message: 'Ad və soyad tələb olunur',
    path: ['full_name'],
  }).transform((input) => ({
    ...input,
    full_name: input.full_name ?? input.name ?? '',
  })),
  z.object({
    role: z.literal('company'),
    phone: PhoneSchema,
    email: EmailSchema,
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
export type WorkerCompleteRegistrationInput = z.infer<typeof WorkerCompleteRegistrationSchema>;
export type WorkerForgotPasswordInput = z.infer<typeof WorkerForgotPasswordSchema>;
export type WorkerResetPasswordInput = z.infer<typeof WorkerResetPasswordSchema>;
export type WorkerPhoneChangeRequestInput = z.infer<typeof WorkerPhoneChangeRequestSchema>;
export type WorkerPhoneChangeConfirmInput = z.infer<typeof WorkerPhoneChangeConfirmSchema>;
export type CompanyRegisterInput = z.infer<typeof CompanyRegisterSchema>;
export type CompanyLoginInput = z.infer<typeof CompanyLoginSchema>;
export type CompanyCompleteRegistrationInput = z.infer<typeof CompanyCompleteRegistrationSchema>;
export type CompanyForgotPasswordInput = z.infer<typeof CompanyForgotPasswordSchema>;
export type CompanyResetPasswordInput = z.infer<typeof CompanyResetPasswordSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export type AdminForgotPasswordInput = z.infer<typeof AdminForgotPasswordSchema>;
export type EmailVerificationRequestInput = z.infer<typeof EmailVerificationRequestSchema>;
export type EmailVerificationConfirmInput = z.infer<typeof EmailVerificationConfirmSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type FcmTokenInput = z.infer<typeof FcmTokenSchema>;
export type DeleteFcmTokenInput = z.infer<typeof DeleteFcmTokenSchema>;
