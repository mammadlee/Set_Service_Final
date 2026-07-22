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
  const company = read('src/modules/companies/companies.service.ts');
  const companyRouter = read('src/modules/companies/companies.router.ts');
  const adminPage = read('apps/admin_panel/src/features/companies/CompanyDetailPage.tsx');

  assert.ok(auth.includes('consumed_at: now'));
  assert.ok(auth.includes('registration_access_token: signRegistrationToken'));
  assert.ok(worker.includes("'registration_otp_consumed'"));
  assert.ok(worker.includes("['health_certificate', 'criminal_record']"));
  assert.ok(worker.includes('missing.push(`document:${type}`)'));
  assert.ok(company.includes("'document:registration_certificate'"));
  assert.ok(company.includes("'verified_email'"));
  assert.ok(company.includes("event: 'document_download_authorized'"));
  assert.ok(company.includes('object_key_hash: crypto.createHash'));
  assert.ok(!company.includes('docs_url: company.docs_url'));
  assert.ok(companyRouter.includes("router.post('/companies/me/documents'"));
  assert.ok(companyRouter.includes("router.get('/admin/companies/:id/documents/:type/download'"));
  assert.ok(adminPage.includes('authorizeDocument'));
  assert.ok(!adminPage.includes('company.data.docs_url'));
  assert.ok(!adminPage.includes('href={doc.url}'));

  console.log('approval-document-security-regression: OK');
}

main();
