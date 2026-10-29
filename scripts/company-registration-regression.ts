import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CompanyCompleteRegistrationSchema,
  CompanyRegisterSchema,
} from '../src/modules/auth/auth.schema';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const registration = {
  name: 'SET Test Hotel',
  contact_name: 'Nigar Əliyeva',
  email: 'nigar@example.invalid',
  phone: '+994501112233',
};

assert.equal(CompanyRegisterSchema.safeParse(registration).success, true);
assert.equal(
  CompanyRegisterSchema.safeParse({ ...registration, registration_certificate: 'private-key' }).success,
  false,
  'company registration must remain document-free and strict',
);

const completion = {
  enrollment_token: 'a'.repeat(43),
  otp_challenge: 'b'.repeat(32),
  password: 'Secure123!',
};
assert.equal(CompanyCompleteRegistrationSchema.safeParse(completion).success, true);
assert.equal(
  CompanyCompleteRegistrationSchema.safeParse({ ...completion, email_otp_code: '123456' }).success,
  false,
  'email verification must not be part of company registration',
);

const auth = read('src/modules/auth/auth.service.ts');
const registerStart = auth.indexOf('export async function registerCompany');
const completeStart = auth.indexOf('export async function completeCompanyRegistration');
const loginStart = auth.indexOf('export async function loginCompany');
assert.ok(registerStart >= 0 && completeStart > registerStart && loginStart > completeStart);

const startFlow = auth.slice(registerStart, completeStart);
const finalFlow = auth.slice(completeStart, loginStart);
assert.ok(startFlow.includes('createCompanyEnrollment'));
assert.ok(startFlow.includes("stage: 'phone_otp_pending'"));
assert.ok(!startFlow.includes('prisma.user.create'));
assert.ok(!startFlow.includes('tx.user.create'));
assert.ok(finalFlow.includes('prisma.$transaction'));
assert.ok(finalFlow.includes('tx.user.create'));
assert.ok(finalFlow.includes("status: 'pending_approval' as CompanyStatus"));
assert.ok(finalFlow.includes('consumeVerifiedOtp'));
assert.ok(finalFlow.includes('user_id: created.id'));
assert.ok(!finalFlow.includes('requestEmailOtp'));
assert.ok(!finalFlow.includes('email_verified_at'));

const router = read('src/modules/auth/auth.router.ts');
assert.ok(router.includes("router.post('/company/complete-registration'"));
assert.ok(router.includes('res.status(201).json(await AuthService.completeCompanyRegistration'));
assert.ok(!router.includes("'/company/confirm-registration-email'"));
assert.ok(!router.includes("'/company/web-enrollment-login'"));
assert.ok(!auth.includes('resumeCompanyEnrollment'));

const companies = read('src/modules/companies/companies.service.ts');
const prerequisites = companies.slice(
  companies.indexOf('function companyApprovalPrerequisites'),
  companies.indexOf('function parseCompanyDocumentType'),
);
assert.ok(prerequisites.includes("'registration_otp_consumed'"));
assert.ok(!prerequisites.includes("'verified_email'"));
assert.ok(companies.includes("status: { not: 'pending_approval' }"));
assert.ok(companies.includes("some: { purpose: 'company_registration', consumed_at: { not: null } }"));

const controller = read(
  'apps/worker_app/lib/features/company/presentation/company_auth_controller.dart',
);
const repository = read('apps/worker_app/lib/features/company/data/company_repository.dart');
assert.ok(controller.includes('CompanyAuthState.pendingApproval'));
assert.ok(controller.includes("code: 'PENDING_APPROVAL'"));
assert.ok(!controller.includes('emailOtpRequired'));
assert.ok(!repository.includes('confirmCompanyRegistrationEmail'));

console.log('company-registration-regression: OK');
