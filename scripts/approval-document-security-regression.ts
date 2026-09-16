import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CompanyUpdateSchema } from '../src/modules/companies/companies.router';
import { CompanyRegisterSchema } from '../src/modules/auth/auth.schema';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function main() {
  const validRegistration = {
    name: 'Safe Company',
    contact_name: 'Safe Contact',
    phone: '+994501234567',
    email: 'safe@example.invalid',
  };
  assert.equal(CompanyRegisterSchema.safeParse(validRegistration).success, true);
  assert.equal(
    CompanyRegisterSchema.safeParse({
      ...validRegistration,
      docs_url: 'https://attacker.invalid/document.pdf',
    }).success,
    false,
    'Company registration must reject arbitrary document URLs',
  );

  const validUpdate = { name: 'Safe Company', email: 'safe@example.invalid' };
  assert.equal(CompanyUpdateSchema.safeParse(validUpdate).success, true);
  assert.equal(
    CompanyUpdateSchema.safeParse({
      ...validUpdate,
      documents: [{ type: 'registration_certificate', url: 'https://attacker.invalid/doc.pdf' }],
    }).success,
    false,
    'Company updates must reject arbitrary document metadata and URLs',
  );

  const auth = read('src/modules/auth/auth.service.ts');
  const worker = read('src/modules/workers/workers.service.ts');
  const workerRouter = read('src/modules/workers/workers.router.ts');
  const company = read('src/modules/companies/companies.service.ts');
  const companyRouter = read('src/modules/companies/companies.router.ts');
  const authRouter = read('src/modules/auth/auth.router.ts');
  const companyEnrollment = read('src/lib/company-enrollment.ts');
  const adminPage = read('apps/admin_panel/src/features/companies/CompanyDetailPage.tsx');
  const companyAuthService = read('apps/company_dashboard/src/features/auth/auth.service.ts');
  const companyHttp = read('apps/company_dashboard/src/shared/api/http.ts');

  assert.ok(auth.includes('consumed_at: now'));
  assert.ok(auth.includes('registration_access_token: signRegistrationToken'));
  assert.ok(worker.includes("'registration_otp_consumed'"));
  assert.ok(worker.includes("['health_certificate', 'criminal_record']"));
  assert.ok(worker.includes('missing.push(`document:${type}`)'));
  assert.ok(worker.includes("type WorkerDocumentType = 'health_certificate' | 'criminal_record' | 'cv'"));
  assert.ok(workerRouter.includes("z.enum(['health_certificate', 'criminal_record', 'cv'])"));
  const approvalPrerequisites = worker.slice(
    worker.indexOf('function workerApprovalPrerequisites'),
    worker.indexOf('async function deletePrivateObjectBestEffort'),
  );
  assert.ok(!approvalPrerequisites.includes("'cv'"), 'CV must stay optional for worker approval');
  assert.ok(workerRouter.includes('work_history_summary:'));
  assert.ok(workerRouter.includes('work_history: z.array'));
  assert.ok(!company.includes("missing.push('document:registration_certificate')"));
  const companyApprovalPrerequisites = company.slice(
    company.indexOf('function companyApprovalPrerequisites'),
    company.indexOf('function parseCompanyDocumentType'),
  );
  assert.ok(!companyApprovalPrerequisites.includes("'verified_email'"));
  assert.ok(company.includes("event: 'document_download_authorized'"));
  assert.ok(company.includes('object_key_hash: crypto.createHash'));
  assert.ok(!company.includes('docs_url: company.docs_url'));
  assert.ok(companyRouter.includes("router.post('/companies/me/documents'"));
  assert.ok(companyRouter.includes("router.get('/admin/companies/:id/documents/:type/download'"));
  assert.ok(authRouter.includes('requireTrustedWebOrigin'));
  assert.ok(!authRouter.includes("'/company/confirm-registration-email'"));
  assert.ok(!authRouter.includes("'/company/web-enrollment-login'"));
  assert.ok(!auth.includes('resumeCompanyEnrollment'));
  assert.ok(auth.includes('createCompanyEnrollment'));
  assert.ok(auth.includes("stage: 'phone_otp_pending'"));
  assert.ok(!auth.includes("stage: 'email_otp_pending'"));
  assert.ok(auth.includes('completeCompanyRegistration'));
  assert.ok(auth.includes('const created = await tx.user.create'));
  assert.ok(auth.includes("status: 'pending_approval' as CompanyStatus"));
  assert.ok(auth.includes("'PENDING_APPROVAL'"));
  assert.ok(companyEnrollment.includes('COMPANY_ENROLLMENT_TTL_MS'));
  assert.ok(companyEnrollment.includes("process.env.NODE_ENV === 'production'"));
  assert.ok(!companyAuthService.includes('/auth/company/register'));
  assert.ok(!companyAuthService.includes('resumeCompanyEnrollment'));
  assert.ok(!companyHttp.includes('bearerToken'));
  assert.equal(
    fs.existsSync(path.join(process.cwd(), 'apps/company_dashboard/src/features/auth/RegistrationPage.tsx')),
    false,
  );
  assert.ok(!adminPage.includes('approvalBlockedByDocument'));
  assert.ok(!adminPage.includes('registrationCertificate'));
  assert.ok(!adminPage.includes('company.data.docs_url'));
  assert.ok(!adminPage.includes('href={doc.url}'));

  console.log('approval-document-security-regression: OK');
}

main();
