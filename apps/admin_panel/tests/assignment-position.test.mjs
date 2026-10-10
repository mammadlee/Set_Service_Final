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
  const compiled = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => dependencies[name] ?? require(name) });
  return exports;
}

const strings = load('../src/shared/i18n/appStrings.ts');
const permissions = load('../src/shared/auth/permissions.ts');
const position = load('../src/features/assignments/assignment-position.ts');
const emptyPage = { data: [], meta: { page: 1, limit: 100, total: 0, total_pages: 1 } };
const order = {
  id: 'order-1', title: 'Banket', category: 'Ofisiant', assignment_count: 0, required_count: 2,
  category_items: [{ id: 'item-1', position_id: 'waiter', category: 'Ofisiant', required_count: 2, remaining_count: 2 }],
};
const workers = [
  { id: 'matching', name: 'Uyğun işçi', status: 'approved', availability: true, worker_class: 'A', position_ids: ['waiter'], positions: [{ id: 'waiter', name_az: 'Ofisiant' }] },
  { id: 'different', name: 'Başqa vəzifəli işçi', status: 'approved', availability: true, worker_class: 'B', position_ids: ['chef'], positions: [{ id: 'chef', name_az: 'Aşpaz' }] },
];
const warning = 'İşçinin əsas vəzifəsi sifarişin tələb etdiyi vəzifədən fərqlidir. Admin olaraq təyinata davam edə bilərsiniz.';

// Exercise the real page's controls and async submit handler with deterministic
// hook state, using the same TS/SSR infrastructure as the other panel regressions.
function pageHarness(user, { selected = [], failCreate = false, workerList = workers, selectedOrder = order } = {}) {
  const requests = [];
  const reloads = [];
  const state = [];
  let stateIndex = 0;
  let asyncIndex = 0;
  let controls = [];
  const runtime = require('react/jsx-runtime');
  const capture = (factory) => (type, props, key) => {
    if (typeof type === 'string') controls.push({ element: type, ...props });
    return factory(type, props, key);
  };
  const assignments = load('../src/features/assignments/assignments.service.ts', {
    '../../shared/api/http': { apiRequest: async (path, options) => {
      requests.push({ path, options });
      if (options?.method === 'POST' && failCreate) throw new Error('Sifariş limiti dolub.');
      return options?.method === 'POST' ? { assigned_count: 1, assignments: [] } : emptyPage;
    } },
  });
  const noUi = () => null;
  const { AssignmentsPage } = load('../src/features/assignments/AssignmentsPage.tsx', {
    react: {
      ...React,
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
    'react/jsx-runtime': { ...runtime, jsx: capture(runtime.jsx), jsxs: capture(runtime.jsxs) },
    '../../app/auth/AuthProvider': { useAuth: () => ({ user }) },
    '../../shared/auth/permissions': permissions,
    '../../shared/api/http': { getErrorMessage: (error) => error.message },
    '../../shared/hooks/useAsync': { useAsync: () => {
      const index = asyncIndex++;
      return {
        data: index === 1 ? { ...emptyPage, data: [selectedOrder] } : index === 2 ? workerList : emptyPage,
        loading: false, error: null, reload: async () => { reloads.push(index); },
      };
    } },
    '../../shared/i18n/appStrings': strings,
    '../../shared/utils/format': { formatDateTime: String },
    '../../shared/components/ConfirmModal': { ConfirmModal: noUi },
    '../../shared/components/PageHeader': { PageHeader: noUi },
    '../../shared/components/StateBlock': { EmptyState: noUi, ErrorState: noUi, LoadingState: noUi },
    '../../shared/components/StatusBadge': { StatusBadge: noUi },
    '../orders/orders.service': { ordersService: {} },
    '../workers/workers.service': { workersService: {} },
    './assignments.service': assignments,
    './assignment-position': position,
  });
  function render() {
    stateIndex = 0;
    asyncIndex = 0;
    controls = [];
    return renderToStaticMarkup(React.createElement(AssignmentsPage));
  }
  render();
  // Select through actual UI handlers, rather than depending on hook slot order.
  const orderSelect = controls.find((control) => control.element === 'select' && control.required);
  if (orderSelect) {
    orderSelect.onChange({ target: { value: 'order-1' } });
    render();
    for (const id of selected) {
      const index = workerList.findIndex((worker) => worker.id === id);
      controls.filter((control) => control.type === 'checkbox')[index].onChange();
      render();
    }
  }
  return {
    render,
    get controls() { return controls; },
    requests, reloads,
    async submit() {
      const form = controls.find((control) => control.element === 'form');
      assert.ok(form);
      form.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
      return render();
    },
  };
}

for (const user of [{ role: 'super_admin' }, { role: 'admin', permissions: ['manage_assignments'] }]) {
  for (const workerId of ['matching', 'different']) {
    test(`${user.role} can submit ${workerId} position; mismatch is advisory only`, async () => {
      const page = pageHarness(user, { selected: [workerId] });
      const html = page.render();
      assert.equal(html.includes(warning), workerId === 'different');
      const submit = page.controls.find((control) => control.type === 'submit');
      assert.equal(submit.disabled, false);
      await page.submit();
      const post = page.requests.find((request) => request.options?.method === 'POST');
      assert.equal(post.path, '/assignments');
      assert.deepEqual(JSON.parse(JSON.stringify(post.options.body)), {
        order_id: 'order-1', worker_ids: [workerId], category: 'Ofisiant', order_category_item_id: 'item-1', position_id: 'waiter',
      });
      assert.deepEqual(page.reloads.sort(), [0, 1]);
    });
  }
}

test('optional class/position filters do not drop selected mismatch or disable its assignment', () => {
  const page = pageHarness({ role: 'super_admin' }, { selected: ['different'] });
  page.render();
  page.controls.find((control) => control['aria-label'] === 'Vəzifə filtri').onChange({ target: { value: 'waiter' } });
  page.controls.find((control) => control['aria-label'] === 'Sinif filtri').onChange({ target: { value: 'A' } });
  const html = page.render();
  assert.equal(page.controls.filter((control) => control.type === 'checkbox').length, 1);
  assert.ok(html.includes(warning), 'selected hidden mismatch remains visible in the advisory');
  assert.equal(page.controls.find((control) => control.type === 'submit').disabled, false);
});

test('API business-rule failure keeps selection and error, with no success refresh', async () => {
  const page = pageHarness({ role: 'super_admin' }, { selected: ['different'], failCreate: true });
  page.render();
  const html = await page.submit();
  assert.match(html, /Sifariş limiti dolub/);
  assert.ok(html.includes(warning));
  assert.equal(page.controls.find((control) => control.type === 'submit').disabled, false);
  assert.deepEqual(page.reloads, []);
});

test('admin without manage_assignments has no assignment form or worker selector', () => {
  const page = pageHarness({ role: 'admin', permissions: ['view_assignments'] });
  assert.doesNotMatch(page.render(), /<form|type="checkbox"/);
});

test('structured position IDs are authoritative and legacy orders use advisory label matching', () => {
  assert.equal(position.hasAssignmentPositionMismatch({ positions: [{ id: 'waiter' }] }, 'waiter'), false);
  assert.equal(position.hasAssignmentPositionMismatch({ position_ids: ['chef'] }, 'waiter'), true);
  assert.equal(position.hasAssignmentPositionMismatch({ position_ids: [] }, null), false);
  assert.equal(position.hasAssignmentPositionMismatch({ position: '  OFİSİANT  ' }, null, 'Ofisiant'), false);
  assert.equal(position.hasAssignmentPositionMismatch({ position: 'Aşpaz' }, null, 'Ofisiant'), true);
  assert.equal(position.hasAssignmentPositionMismatch({ position_ids: ['chef'], position: 'Ofisiant' }, 'waiter', 'Ofisiant'), true);
});

test('legacy label-only order shows advisory for a different role without blocking submission', async () => {
  const page = pageHarness({ role: 'super_admin' }, {
    selected: ['different'], selectedOrder: { ...order, category_items: [] },
  });
  assert.ok(page.render().includes(warning));
  assert.equal(page.controls.find((control) => control.type === 'submit').disabled, false);
  await page.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(page.requests[0].options.body)), { order_id: 'order-1', worker_ids: ['different'] });
});

test('all workers remain listed while assignment batch is limited to the existing API maximum of 100', () => {
  const workerList = Array.from({ length: 101 }, (_, index) => ({ ...workers[0], id: `worker-${index}` }));
  const page = pageHarness({ role: 'super_admin' }, { selected: workerList.slice(0, 100).map((worker) => worker.id), workerList });
  assert.match(page.render(), /Bir dəfəyə ən çox 100 işçi/);
  const checkboxes = page.controls.filter((control) => control.type === 'checkbox');
  assert.equal(checkboxes.length, 101);
  assert.equal(checkboxes[100].disabled, true);
  assert.equal(checkboxes[0].disabled, false, 'already selected workers can still be deselected');
  checkboxes[100].onChange();
  page.render();
  assert.equal(page.controls.filter((control) => control.type === 'checkbox' && control.checked).length, 100);
});

test('assignment picker fetches every approved available page, without an implicit position/class filter', async () => {
  const calls = [];
  const { workersService } = load('../src/features/workers/workers.service.ts', {
    '../../shared/api/http': { apiRequest: async (path, options) => {
      calls.push({ path, ...options.query });
      const page = options.query.page;
      return { data: Array.from({ length: page === 3 ? 1 : 100 }, (_, index) => ({ id: `worker-${(page - 1) * 100 + index}` })), meta: { total_pages: 3 } };
    } },
    '../../shared/utils/documents': {},
  });
  const result = await workersService.listAvailableForAssignments();
  assert.equal(result.length, 201);
  assert.equal(result[200].id, 'worker-200');
  assert.deepEqual(calls.map((call) => call.page), [1, 2, 3]);
  for (const call of calls) {
    assert.equal(call.path, '/admin/workers');
    assert.equal(call.status, 'approved');
    assert.equal(call.available, true);
    assert.equal(call.position_id, undefined);
    assert.equal(call.worker_class, undefined);
  }
});

test('a later worker page failure is surfaced rather than silently hiding workers', async () => {
  const { workersService } = load('../src/features/workers/workers.service.ts', {
    '../../shared/api/http': { apiRequest: async (_path, options) => {
      if (options.query.page === 2) throw new Error('İşçi siyahısı yüklənmədi.');
      return { data: [workers[0]], meta: { total_pages: 2 } };
    } },
    '../../shared/utils/documents': {},
  });
  await assert.rejects(() => workersService.listAvailableForAssignments(), /İşçi siyahısı yüklənmədi/);
});
