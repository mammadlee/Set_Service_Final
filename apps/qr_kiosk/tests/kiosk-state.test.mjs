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
  let timer = 0;
  const document = {
    visibilityState: 'visible', documentElement: {}, addEventListener() {},
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {
        textContent: '', dataset: {}, src: '', offsetWidth: 1,
        classList: { add() {}, remove() {} }, addEventListener() {}, removeAttribute(name) { this[name] = ''; },
      });
      return nodes.get(id);
    },
  };
  const clear = (id) => { timeouts.delete(id); intervals.delete(id); };
  const context = vm.createContext({
    document, URLSearchParams, Date, Intl, Error, Number, Math, AbortSignal,
    resolveApiBaseUrl: () => 'http://localhost/v1',
    QRCode: { toDataURL: async (value) => `data:image/png;${value}` },
    clearTimeout: clear, clearInterval: clear,
    window: {
      location: { hash, pathname: '/kiosk', origin: 'http://localhost' },
      history: { replaceState() {} }, addEventListener() {},
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
  return { nodes, timeouts, intervals, requests, context, document };
}

test('valid company-created kiosk shows QR with header capability, preserved Azerbaijani text and safe invalid date', async () => {
  const f = fixture((url) => ({ status: 200, body: url.endsWith('/context') ? active : qr }));
  await drain();
  assert.match(f.nodes.get('qrImage').src, /signed-attendance-token/);
  assert.equal(f.nodes.get('companyName').textContent, active.company_name);
  assert.equal(f.nodes.get('shiftText').textContent, '- - -');
  for (const { url, init } of f.requests) {
    assert.ok(!url.includes('capability'));
    assert.equal(init.headers['x-kiosk-capability'], 'test-capability');
    assert.equal(init.credentials, 'omit');
  }
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
  assert.equal(f.nodes.get('networkText').textContent, 'QR ekranı üçün aktiv sifariş seçilməlidir.');
  assert.deepEqual([...f.timeouts.values()].map((item) => item.delay), [8000]);
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
