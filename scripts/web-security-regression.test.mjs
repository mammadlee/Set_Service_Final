import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function source(path) {
  return readFile(join(repositoryRoot, path), 'utf8');
}

for (const app of ['admin_panel', 'company_dashboard']) {
  test(`${app} keeps access tokens in memory and refresh tokens in an HttpOnly session`, async () => {
    const tokenStore = await source(`apps/${app}/src/shared/api/tokenStore.ts`);
    const jwt = await source(`apps/${app}/src/shared/api/jwt.ts`);
    const authProvider = await source(`apps/${app}/src/app/auth/AuthProvider.tsx`);
    const http = await source(`apps/${app}/src/shared/api/http.ts`);
    const authService = await source(`apps/${app}/src/features/auth/auth.service.ts`);
    const types = await source(`apps/${app}/src/shared/api/types.ts`);

    assert.match(tokenStore, /let accessToken:\s*string \| null = null/);
    assert.doesNotMatch(tokenStore, /(?:localStorage|sessionStorage)\.setItem/);
    assert.match(tokenStore, /(?:localStorage|sessionStorage)\.removeItem/);
    assert.match(jwt, /token_use\?: 'access' \| 'refresh'/);
    assert.match(jwt, /payload\?\.token_use === 'access'/);
    assert.match(authProvider, /refreshSession/);
    assert.match(http, /credentials:\s*'include'/);
    assert.match(http, /\/auth\/(?:admin|company)\/web-refresh/);
    assert.match(authService, /\/auth\/(?:admin|company)\/web-login/);
    assert.match(authService, /\/auth\/(?:admin|company)\/web-logout/);
    assert.doesNotMatch(types, /refresh_token/);
  });

  test(`${app} has a top-level render boundary and no production source maps`, async () => {
    const main = await source(`apps/${app}/src/main.tsx`);
    const vite = await source(`apps/${app}/vite.config.ts`);
    const html = await source(`apps/${app}/index.html`);

    assert.match(main, /<ErrorBoundary>/);
    assert.match(vite, /sourcemap:\s*false/);
    assert.match(html, /name="referrer" content="no-referrer"/);
    const headers = await source(`apps/${app}/public/_headers`);
    assert.match(headers, /Content-Security-Policy: default-src 'self'/);
    assert.match(headers, /frame-ancestors 'none'/);
    assert.match(headers, /Strict-Transport-Security:/);
    assert.match(headers, /Permissions-Policy:/);
  });
}

test('backend web sessions use role-scoped rotating HttpOnly cookies and trusted origins', async () => {
  const session = await source('src/modules/auth/web-session.ts');
  const router = await source('src/modules/auth/auth.router.ts');
  const app = await source('src/app.ts');
  const checkEnv = await source('src/lib/check-env.ts');

  assert.match(session, /setservice_admin_refresh/);
  assert.match(session, /setservice_company_refresh/);
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /sameSite/);
  assert.match(session, /sameSite === 'none'/);
  assert.match(session, /allowedOrigins\.includes\(origin\)/);
  assert.match(session, /AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none/);
  assert.match(router, /\/company\/web-login/);
  assert.match(router, /\/company\/web-refresh/);
  assert.match(router, /\/company\/web-logout/);
  assert.match(router, /\/admin\/web-login/);
  assert.match(router, /\/admin\/web-refresh/);
  assert.match(router, /\/admin\/web-logout/);
  assert.match(router, /logoutByRefreshToken/);
  assert.match(app, /credentials:\s*true/);
  assert.match(checkEnv, /AUTH_COOKIE_SAME_SITE/);
  assert.match(checkEnv, /\['strict', 'lax', 'none'\]/);
});

test('QR kiosk suppresses token-bearing request metadata and locks hidden screens', async () => {
  const main = await source('apps/qr_kiosk/src/main.ts');
  const config = await source('apps/qr_kiosk/src/config.ts');
  const html = await source('apps/qr_kiosk/index.html');
  const headers = await source('apps/qr_kiosk/public/_headers');
  const attendanceRouter = await source('src/modules/attendance/attendance.router.ts');
  const attendanceService = await source('src/modules/attendance/attendance.service.ts');

  assert.match(main, /cache:\s*'no-store'/);
  assert.match(main, /credentials:\s*'omit'/);
  assert.match(main, /referrerPolicy:\s*'no-referrer'/);
  assert.match(main, /window\.location\.hash/);
  assert.match(main, /window\.history\.replaceState/);
  assert.match(main, /'x-kiosk-capability': token/);
  assert.match(main, /'\/attendance\/venue-kiosks\/context'/);
  assert.match(main, /'\/attendance\/venue-kiosks\/qr-token'/);
  assert.doesNotMatch(main, /venue-kiosks\/\$\{token\}/);
  assert.match(main, /visibilitychange/);
  assert.match(main, /pagehide/);
  assert.match(main, /PageTransitionEvent/);
  assert.match(main, /hideQrForScreenLock/);
  assert.match(config, /parsed\.protocol !== 'https:'/);
  assert.match(config, /isPrivateOrLocalHostname/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(headers, /Content-Security-Policy: default-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Strict-Transport-Security:/);
  assert.match(headers, /Permissions-Policy:/);
  assert.match(attendanceService, /\/kiosk#capability=\$\{encodeURIComponent\(token\)\}/);
  assert.match(attendanceService, /toVenueKioskPublicResponse/);
  assert.match(attendanceService, /toVenueKioskManagementResponse/);

  const publicResponseStart = attendanceService.indexOf(
    'function toVenueKioskPublicResponse',
  );
  const managementResponseStart = attendanceService.indexOf(
    'function toVenueKioskManagementResponse',
  );
  assert.ok(publicResponseStart >= 0);
  assert.ok(managementResponseStart > publicResponseStart);
  const publicResponseSource = attendanceService.slice(
    publicResponseStart,
    managementResponseStart,
  );
  assert.doesNotMatch(publicResponseSource, /decryptKioskToken|kiosk_url|kiosk_token/);
  assert.match(
    attendanceService.slice(managementResponseStart),
    /decryptKioskToken\(kiosk\.token_ciphertext\)/,
  );

  assert.match(
    attendanceRouter,
    /legacyKioskPathsEnabled = process\.env\.NODE_ENV !== 'production'/,
  );
  const legacyStart = attendanceRouter.indexOf('// LOCAL_ONLY_KIOSK_LEGACY_START');
  const legacyEnd = attendanceRouter.indexOf('// LOCAL_ONLY_KIOSK_LEGACY_END');
  assert.ok(legacyStart >= 0 && legacyEnd > legacyStart);
  assert.match(
    attendanceRouter.slice(legacyStart, legacyEnd),
    /if \(legacyKioskPathsEnabled\)/,
  );
});

test('push producers carry explicit recipient roles for role-safe deep links', async () => {
  const assignments = await source('src/modules/assignments/assignments.service.ts');
  const attendance = await source('src/modules/attendance/attendance.service.ts');
  const orders = await source('src/modules/orders/orders.repository.ts');
  const deepLinks = await source('apps/worker_app/lib/core/push/push_deep_link.dart');

  assert.match(assignments, /assignment_id:[\s\S]*?role: 'worker'/);
  assert.match(assignments, /assignment_id:[\s\S]*?role: 'company'/);
  assert.match(attendance, /attendance_checked_in[\s\S]*?role: 'company'/);
  assert.match(attendance, /attendance_checked_out[\s\S]*?role: 'company'/);
  assert.match(orders, /event_type: 'order\.created'[\s\S]*?role: 'super_admin'/);
  assert.match(orders, /event_type: 'order\.cancelled'[\s\S]*?role: 'worker'/);
  assert.match(deepLinks, /payloadRole == null \|\| payloadRole != activeRole/);
  assert.match(deepLinks, /'admin' \|\| 'super_admin' => AppRole\.admin/);
});
