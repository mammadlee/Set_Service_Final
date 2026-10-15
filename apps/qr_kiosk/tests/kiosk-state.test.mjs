import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.env.DEV', 'false');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const active = {
  company_name: 'Müəssisə ƏÖĞŞÜÇ', kiosk_status: 'active', status: 'active',
  active_session: { order_id: 'order', order_title: 'Sifariş', shift_start: 'invalid date' },
};
const qr = { ...active, token: 'signed-attendance-token', expires_at: new Date(Date.now() + 60000).toISOString(), refresh_after_seconds: 30 };
const drain = () => new Promise((resolve) => setImmediate(resolve));

function fixture(responder, hash = '#capability=test-capability') {
  const nodes = new Map();
  const timeouts = new Map();
  const intervals = new Map();
  const requests = [];
  const historyReplacements = [];
  let timer = 0;
  const makeNode = (tagName = 'div') => ({
    tagName: tagName.toUpperCase(), textContent: '', dataset: {}, src: '', offsetWidth: 1,
    hidden: false, disabled: false, value: '', selected: false, children: [],
    classList: { add() {}, remove() {} }, addEventListener() {},
    removeAttribute(name) { this[name] = ''; },
    replaceChildren(...children) { this.children = children; this.value = children.find((child) => child.selected)?.value ?? children[0]?.value ?? ''; },
    append(child) { this.children.push(child); if (child.selected || !this.value) this.value = child.value; },
  });
  const document = {
    visibilityState: 'visible', documentElement: {}, addEventListener() {},
    createElement(tagName) { return makeNode(tagName); },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, makeNode());
      return nodes.get(id);
    },
  };
  const clear = (id) => { timeouts.delete(id); intervals.delete(id); };
  const location = { hash, pathname: '/kiosk', origin: 'http://localhost' };
  const context = vm.createContext({
    document, URLSearchParams, Date, Intl, Error, Number, Math, AbortSignal,
    resolveApiBaseUrl: () => 'http://localhost/v1',
    resolveAppTimeZone: () => 'Asia/Baku',
    navigator: { onLine: true },
    QRCode: { toDataURL: async (value) => `data:image/png;${value}` },
    clearTimeout: clear, clearInterval: clear,
    window: {
      location,
      history: { replaceState(...args) { historyReplacements.push(args); } }, addEventListener() {},
      setTimeout(fn, delay) { timeouts.set(++timer, { fn, delay }); return timer; },
      setInterval(fn) { intervals.set(++timer, fn); return timer; },
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      const response = await responder(url, requests.length);
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    },
  });
  vm.runInContext(compiled, context);
  return { nodes, timeouts, intervals, requests, context, document, location, historyReplacements };
}

test('valid company-created kiosk shows QR with header capability, preserved Azerbaijani text and safe invalid date', async () => {
  const f = fixture((url) => ({ status: 200, body: url.endsWith('/context') ? active : qr }));
  await drain();
  assert.match(f.nodes.get('qrImage').src, /signed-attendance-token/);
  assert.equal(f.nodes.get('companyName').textContent, active.company_name);
  assert.equal(f.nodes.get('shiftText').textContent, '- - -');
  assert.notEqual(f.nodes.get('currentDateTime').textContent, '--:--');
  assert.equal(f.nodes.get('connectionText').textContent, 'Bağlantı aktivdir');
  assert.equal(f.location.hash, '#capability=test-capability');
  assert.equal(f.historyReplacements.length, 0);
  for (const { url, init } of f.requests) {
    assert.ok(!url.includes('capability'));
    assert.equal(init.headers['x-kiosk-capability'], 'test-capability');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
  }
});

test('active QR shows a countdown and refreshes from the 30-second server interval', async () => {
  let qrCount = 0;
  const firstQr = {
    ...qr,
    token: 'signed-attendance-token-first',
    expires_at: new Date(Date.now() + 30000).toISOString(),
    refresh_after_seconds: 30,
  };
  const secondQr = {
    ...firstQr,
    token: 'signed-attendance-token-second',
    expires_at: new Date(Date.now() + 30000).toISOString(),
  };
  const f = fixture((url) => ({
    status: 200,
    body: url.endsWith('/context') ? active : qrCount++ === 0 ? firstQr : secondQr,
  }));
  await drain();

  assert.match(f.nodes.get('qrImage').src, /signed-attendance-token-first/);
  assert.ok(Number(f.nodes.get('countdownValue').textContent) > 0);
  assert.match(f.nodes.get('countdownText').textContent, /saniyədən sonra/);
  const refreshTimer = [...f.timeouts.values()].find((item) => item.delay === 28800);
  assert.ok(refreshTimer, 'refresh must be scheduled 1.2s before the 30s expiry');

  refreshTimer.fn();
  await drain();
  await drain();
  assert.match(f.nodes.get('qrImage').src, /signed-attendance-token-second/);
});

test('expired QR is hidden and marked for refresh', async () => {
  const f = fixture((url) => ({ status: 200, body: url.endsWith('/context') ? active : qr }));
  await drain();
  vm.runInContext('qrExpiresAt = Date.now() - 1000; updateCountdown()', f.context);
  assert.equal(f.nodes.get('qrImage').src, '');
  assert.equal(f.nodes.get('statusBadge').textContent, 'Yenilənir');
  assert.equal(f.nodes.get('qrPlaceholder').textContent, 'QR yenilənir');
});

test('fragment capability survives reload or browser restore without browser storage or URL transport', async () => {
  const hash = '#capability=persistent-tablet-capability';
  const responder = (url) => ({ status: 200, body: url.endsWith('/context') ? active : qr });
  const firstLoad = fixture(responder, hash);
  await drain();
  const restoredLoad = fixture(responder, firstLoad.location.hash);
  await drain();

  for (const loaded of [firstLoad, restoredLoad]) {
    assert.equal(loaded.location.hash, hash);
    assert.equal(loaded.historyReplacements.length, 0);
    assert.ok(loaded.requests.length >= 2);
    for (const { url, init } of loaded.requests) {
      assert.ok(!url.includes('persistent-tablet-capability'));
      assert.equal(init.headers['x-kiosk-capability'], 'persistent-tablet-capability');
      assert.equal(init.referrerPolicy, 'no-referrer');
    }
  }
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\b/);
});

for (const status of [400, 401, 403, 404, 410]) {
  test(`invalid or disabled capability HTTP ${status} clears QR and stops requests`, async () => {
    const f = fixture(() => ({ status, body: { code: 'VENUE_KIOSK_DISABLED' } }));
    await drain();
    assert.equal(f.nodes.get('qrImage').src, '');
    assert.equal(f.nodes.get('statusBadge').textContent, 'Deaktiv');
    assert.equal(f.timeouts.size, 0);
    assert.equal(f.intervals.size, 0);
  });
}

test('missing capability never calls API', async () => {
  const f = fixture(() => { throw new Error('should not request'); }, '');
  await drain();
  assert.equal(f.requests.length, 0);
  assert.equal(f.nodes.get('statusBadge').textContent, 'Deaktiv');
});

test('inactive session waits for company/admin activation without displaying a QR', async () => {
  const f = fixture(() => ({ status: 200, body: { ...active, active_session: null } }));
  await drain();
  assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.get('qrImage').src, '');
  assert.equal(f.nodes.get('statusBadge').textContent, 'Gözləyir');
  assert.match(f.nodes.get('networkText').textContent, /Hazırda aktiv növbə yoxdur/);
  assert.deepEqual([...f.timeouts.values()].map((item) => item.delay), [8000]);
});

test('multiple simultaneous shifts require a clear selection and selecting one starts QR rotation', async () => {
  const choices = [
    { id: 'order-a', title: 'Səhər növbəsi', status: 'active', company_id: 'company', shift_start: new Date(Date.now() - 60_000).toISOString(), shift_end: new Date(Date.now() + 60_000).toISOString() },
    { id: 'order-b', title: 'Banket növbəsi', status: 'active', company_id: 'company', shift_start: new Date(Date.now() - 60_000).toISOString(), shift_end: new Date(Date.now() + 60_000).toISOString() },
  ];
  const waiting = { ...active, active_session: null, selection_required: true, eligible_orders: choices };
  const selected = { ...active, active_session: { order_id: 'order-b', order_title: 'Banket növbəsi' }, eligible_orders: choices };
  const f = fixture((url) => {
    if (url.endsWith('/select-order')) return { status: 200, body: selected };
    if (url.endsWith('/qr-token')) return { status: 200, body: { ...qr, ...selected } };
    return { status: 200, body: waiting };
  });
  await drain();
  assert.equal(f.nodes.get('shiftSelector').hidden, false);
  assert.equal(f.nodes.get('orderSelect').children.length, 2);
  assert.equal(f.nodes.get('statusBadge').textContent, 'Gözləyir');

  f.nodes.get('orderSelect').value = 'order-b';
  await vm.runInContext('selectOrder()', f.context);
  await drain();
  assert.match(f.nodes.get('qrImage').src, /signed-attendance-token/);
  const selectionRequest = f.requests.find(({ url }) => url.endsWith('/select-order'));
  assert.deepEqual(JSON.parse(selectionRequest.init.body), { order_id: 'order-b' });
});

test('offline state is visible and online recovery reloads context', async () => {
  const f = fixture((url) => ({ status: 200, body: url.endsWith('/context') ? active : qr }));
  await drain();
  vm.runInContext('handleOffline()', f.context);
  assert.equal(f.nodes.get('connectionText').textContent, 'Bağlantı yoxdur');
  assert.equal(f.nodes.get('statusBadge').textContent, 'Oflayn');
  const before = f.requests.length;
  vm.runInContext('handleOnline()', f.context);
  await drain();
  assert.ok(f.requests.length > before);
  assert.equal(f.nodes.get('connectionText').textContent, 'Bağlantı aktivdir');
});

test('cancelled/completed/expired order clears QR and polls for next active order without minting retries', async () => {
  const f = fixture((url) => url.endsWith('/context')
    ? { status: 200, body: active }
    : { status: 410, body: { code: 'KIOSK_ORDER_INACTIVE' } });
  await drain();
  assert.equal(f.nodes.get('qrImage').src, '');
  assert.equal(f.nodes.get('statusBadge').textContent, 'Gözləyir');
  assert.match(f.nodes.get('networkText').textContent, /Sifariş artıq aktiv deyil/);
  assert.deepEqual([...f.timeouts.values()].map((item) => item.delay), [8000]);
});

test('expired or malformed QR response is not rendered', async () => {
  for (const expires_at of ['invalid', new Date(0).toISOString()]) {
    const f = fixture((url) => ({ status: 200, body: url.endsWith('/context') ? active : { ...qr, expires_at } }));
    await drain();
    assert.equal(f.nodes.get('qrImage').src, '');
    assert.equal(f.nodes.get('statusBadge').textContent, 'Gözləyir');
  }
});

test('in-flight QR cannot reappear after context disables the kiosk', async () => {
  let completeQr;
  let contexts = 0;
  const f = fixture((url) => {
    if (url.endsWith('/context')) return { status: ++contexts === 1 ? 200 : 410, body: active };
    return new Promise((resolve) => { completeQr = resolve; });
  });
  await drain();
  // A visibility transition invalidates the pending QR. Its completion must not restore it.
  f.document.visibilityState = 'hidden';
  vm.runInContext('handleVisibilityChange()', f.context);
  completeQr({ status: 200, body: qr });
  await drain();
  f.document.visibilityState = 'visible';
  vm.runInContext('handleVisibilityChange()', f.context);
  await drain();
  assert.equal(f.nodes.get('qrImage').src, '');
  assert.equal(f.nodes.get('statusBadge').textContent, 'Deaktiv');
});
