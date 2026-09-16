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
  const adminPage = read('apps/admin_panel/src/features/companies/CompanyDetailPage.tsx');
  const companyEnrollmentPage = read('apps/company_dashboard/src/features/auth/RegistrationPage.tsx');
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
  assert.ok(company.includes("'verified_email'"));
  assert.ok(company.includes("event: 'document_download_authorized'"));
  assert.ok(company.includes('object_key_hash: crypto.createHash'));
  assert.ok(!company.includes('docs_url: company.docs_url'));
  assert.ok(companyRouter.includes("router.post('/companies/me/documents'"));
  assert.ok(companyRouter.includes("router.get('/admin/companies/:id/documents/:type/download'"));
  assert.ok(authRouter.includes("'/company/web-enrollment-login'"));
  assert.ok(authRouter.includes('requireTrustedWebOrigin'));
  assert.ok(authRouter.includes("res.set('Cache-Control', 'private, no-store, max-age=0')"));
  assert.ok(auth.includes('export async function resumeCompanyEnrollment'));
  assert.ok(auth.includes("user.company.status !== 'pending_approval'"));
  assert.ok(auth.includes("'COMPANY_ENROLLMENT_CLOSED'"));
  assert.ok(auth.includes('required_document_types: []'));
  assert.ok(companyAuthService.includes("'/auth/company/web-enrollment-login'"));
  assert.ok(!companyAuthService.includes("body.set('type', 'registration_certificate')"));
  assert.ok(!companyEnrollmentPage.includes('registration_certificate'));
  assert.ok(companyEnrollmentPage.includes("setStage('complete')"));
  assert.ok(companyHttp.includes('options.bearerToken'));
  assert.ok(!companyEnrollmentPage.includes('localStorage'));
  assert.ok(!companyEnrollmentPage.includes('sessionStorage'));
  assert.ok(!adminPage.includes('approvalBlockedByDocument'));
  assert.ok(!adminPage.includes('registrationCertificate'));
  assert.ok(!adminPage.includes('company.data.docs_url'));
  assert.ok(!adminPage.includes('href={doc.url}'));

  console.log('approval-document-security-regression: OK');
}

main();
