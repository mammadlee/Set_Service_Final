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
