import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/shared/utils/documents.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, URL, require: () => ({ API_BASE_URL: 'https://api.example.test/v1' }) });

test('admin document metadata keeps private CV optional and never treats raw object URL/key as downloadable', () => {
  const documents = exports.normalizeDocuments([
    { type: 'health_certificate', status: 'ready', scan_status: 'clean', name: 'sağlamlıq.pdf', key: 'private-key' },
    { type: 'criminal_record', status: 'quarantined', scan_status: 'pending', url: 'https://private-object' },
    { type: 'cv', status: 'ready', scan_status: 'clean', name: 'CV.pdf' },
    { type: 'cv', status: 'deleted' },
    { type: 'arbitrary', status: 'ready', scan_status: 'clean' },
  ]);
  assert.equal(documents.length, 3);
  assert.equal(documents[0].canDownload, true);
  assert.equal(documents[1].canDownload, false);
  assert.equal(documents[2].type, 'cv');
  assert.equal(documents[0].key, undefined);
  assert.equal(documents[1].url, undefined);
  assert.equal(exports.documentLabel('health_certificate'), 'Sağlamlıq arayışı');
});

test('authorized document URL accepts signed HTTPS links and rejects executable/insecure URLs', () => {
  assert.equal(exports.resolveSignedDocumentUrl('https://storage.example.test/private?sig=test'), 'https://storage.example.test/private?sig=test');
  assert.equal(exports.resolveSignedDocumentUrl('/v1/private-download/opaque'), 'https://api.example.test/v1/private-download/opaque');
  for (const url of [undefined, '', 'javascript:alert(1)', 'data:text/html,payload', 'http://storage.example.test/file', 'https://user:password@example.test/file']) {
    assert.throws(() => exports.resolveSignedDocumentUrl(url));
  }
});

test('admin opens a private CV through the authenticated API client, never a metadata URL', async () => {
  const calls = [];
  const serviceExports = {};
  const serviceSource = readFileSync(new URL('../src/features/workers/workers.service.ts', import.meta.url), 'utf8');
  const serviceCompiled = ts.transpileModule(serviceSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(serviceCompiled, {
    exports: serviceExports,
    require: (path) => path.endsWith('/http')
      ? { apiRequest: async (...args) => { calls.push(args); return { url: 'https://private.example.test/cv?signature=short-lived' }; } }
      : exports,
  });
  const url = await serviceExports.workersService.documentUrl('worker-id', 'cv');
  assert.equal(calls[0][0], '/workers/worker-id/documents/cv/download');
  assert.equal(calls[0].length, 1, 'uses the API client default authenticated request');
  assert.equal(url, 'https://private.example.test/cv?signature=short-lived');
  await assert.rejects(() => serviceExports.workersService.documentUrl('worker-id', '../../other-object'));
  assert.equal(calls.length, 1);
});

for (const app of ['admin_panel', 'company_dashboard']) {
  const documentExports = {};
  const code = readFileSync(new URL(`../../${app}/src/shared/utils/documents.ts`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: documentExports, URL, require: () => ({ API_BASE_URL: 'https://api.example.test/v1' }) });

  test(`${app}: legacy URLs are locators only and download availability comes from backend metadata`, () => {
    const result = documentExports.normalizeDocuments([
      { type: 'health_certificate', company_visible: true, status: 'legacy', available: true, url: 'https://private.r2.cloudflarestorage.com/expired', key: 'private-key' },
      { type: 'health_certificate', company_visible: true, status: 'quarantined', scan_status: 'pending' },
    ]);
    assert.equal(result[0].canDownload, true);
    assert.equal(result[0].url, undefined);
    assert.equal(result[0].key, undefined);
    assert.match(documentExports.documentStatusLabel(result[0]), /Açılarkən/);
    assert.equal(result[1].canDownload, false);
  });

  test(`${app}: every open fetches a fresh authorized link, reserves Safari tab synchronously, and removes opener/referrer`, async () => {
    let count = 0;
    let opened = 0;
    const destinations = [];
    const tabs = [];
    const browser = {
      open: (url) => {
        assert.equal(url, 'about:blank');
        opened++;
        const tab = {
          opener: 'original',
          closed: false,
          document: { createElement: () => ({}), head: { append: (meta) => assert.deepEqual(meta, { name: 'referrer', content: 'no-referrer' }) } },
          location: { replace: (url) => destinations.push(url) },
          close() { this.closed = true; },
        };
        tabs.push(tab);
        return tab;
      },
      location: { assign: () => assert.fail('unexpected same-tab navigation') },
    };
    const load = async () => {
      count++;
      assert.equal(opened, count, 'tab reserved before the async API request');
      return `https://storage.example.test/file?X-Amz-Signature=fresh-${count}`;
    };
    await documentExports.openPrivateDocument(load, browser);
    await documentExports.openPrivateDocument(load, browser);
    assert.equal(count, 2);
    assert.notEqual(destinations[0], destinations[1]);
    assert.ok(tabs.every(tab => tab.opener === null));
  });

  test(`${app}: authorization failure closes empty tab; blocked popup still uses a fresh link`, async () => {
    let closed = false;
    const tab = {
      document: { createElement: () => ({}), head: { append() {} } },
      close() { closed = true; },
    };
    const denial = new Error('forbidden');
    await assert.rejects(documentExports.openPrivateDocument(async () => { throw denial; }, { open: () => tab }), error => error === denial);
    assert.equal(closed, true);
    let destination;
    await documentExports.openPrivateDocument(async () => 'https://storage.example.test/fresh', {
      open: () => null, location: { assign: (url) => { destination = url; } },
    });
    assert.equal(destination, 'https://storage.example.test/fresh');
  });
}

test('company only opens consented health certificates via authenticated endpoint, not CV/criminal/raw links', async () => {
  const calls = [];
  const documents = {};
  const service = {};
  const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compile('../../company_dashboard/src/shared/utils/documents.ts'), {
    exports: documents, URL, require: () => ({ API_BASE_URL: 'https://api.example.test/v1' }),
  });
  assert.equal(documents.normalizeDocuments([
    { type: 'cv', company_visible: true, available: true },
    { type: 'criminal_record', company_visible: true, available: true },
    { type: 'health_certificate', company_visible: false, available: true },
  ]).length, 0);
  vm.runInNewContext(compile('../../company_dashboard/src/features/workers/workers.service.ts'), {
    exports: service,
    require: path => path.endsWith('/http')
      ? { apiRequest: async (...args) => { calls.push(args); return { url: 'https://storage.example.test/fresh' }; } }
      : documents,
  });
  await service.workersService.documentUrl('worker-id', 'health_certificate');
  assert.deepEqual(calls[0], ['/workers/worker-id/documents/health_certificate/download']);
  await assert.rejects(() => service.workersService.documentUrl('worker-id', 'cv'));
  await assert.rejects(() => service.workersService.documentUrl('worker-id', 'criminal_record'));
  assert.equal(calls.length, 1);
});
