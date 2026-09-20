import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}

const strings = load('../src/shared/i18n/appStrings.ts');
const permissions = load('../src/shared/auth/permissions.ts');
const emptyPage = { data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 1 } };
const publishedPage = {
  ...emptyPage,
  data: [{ id: 'new-order', title: 'Yeni banket', status: 'published', assignment_count: 0, required_count: 1 }],
};

async function renderSelector(user) {
  const requests = [];
  const loaders = [];
  const orders = load('../src/features/orders/orders.service.ts', {
    '../../shared/api/http': { apiRequest: async (...args) => { requests.push(args); return publishedPage; } },
  });
  let hookIndex = 0;
  const noUi = () => null;
  const { AssignmentsPage } = load('../src/features/assignments/AssignmentsPage.tsx', {
    '../../app/auth/AuthProvider': { useAuth: () => ({ user }) },
    '../../shared/auth/permissions': permissions,
    '../../shared/api/http': { getErrorMessage: String },
    '../../shared/hooks/useAsync': {
      useAsync: (loader) => {
        loaders.push(loader());
        return { data: hookIndex++ === 1 ? publishedPage : emptyPage, loading: false, reload: async () => {} };
      },
    },
    '../../shared/i18n/appStrings': strings,
    '../../shared/utils/format': { formatDateTime: String },
    '../../shared/components/ConfirmModal': { ConfirmModal: noUi },
    '../../shared/components/PageHeader': { PageHeader: noUi },
    '../../shared/components/StateBlock': { EmptyState: noUi, ErrorState: noUi, LoadingState: noUi },
    '../../shared/components/StatusBadge': { StatusBadge: noUi },
    '../orders/orders.service': orders,
    '../workers/workers.service': { workersService: { list: async () => emptyPage } },
    './assignments.service': { assignmentsService: { list: async () => emptyPage } },
  });
  const html = renderToStaticMarkup(React.createElement(AssignmentsPage));
  await Promise.all(loaders);
  return { html, requests };
}

test('real admin assignment selector requests staffing scope and renders published orders with zero workers', async () => {
  const { html, requests } = await renderSelector({ role: 'super_admin' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/orders');
  assert.equal(requests[0][1].query.scope, 'staffing');
  assert.equal(requests[0][1].query.status, undefined, 'must not request literal legacy active status');
  assert.match(html, /<option value="new-order">Yeni banket \(0\/1\)<\/option>/);
});

test('admin without assignment management permission cannot load or see the creation selector', async () => {
  const { html, requests } = await renderSelector({ role: 'admin', permissions: ['view_assignments'] });
  assert.equal(requests.length, 0);
  assert.doesNotMatch(html, /value="new-order"/);
  assert.doesNotMatch(html, /<form/);
});
