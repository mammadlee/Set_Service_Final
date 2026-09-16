import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

const root = process.cwd();
const swaggerPath = path.join(root, 'swagger.yaml');
const document = yaml.load(fs.readFileSync(swaggerPath, 'utf8'));
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

const routerMounts = [
  ['src/modules/auth/auth.router.ts', 'router', '/auth'],
  ['src/modules/taxonomy/taxonomy.router.ts', 'router', '/taxonomy'],
  ['src/modules/companies/companies.router.ts', 'router', ''],
  ['src/modules/workers/workers.router.ts', 'router', ''],
  ['src/modules/orders/orders.router.ts', 'router', '/orders'],
  ['src/modules/assignments/assignments.router.ts', 'assignCompatibilityRouter', '/orders'],
  ['src/modules/assignments/assignments.router.ts', 'router', '/assignments'],
  ['src/modules/attendance/attendance.router.ts', 'router', '/attendance'],
  ['src/modules/ratings/ratings.router.ts', 'router', '/ratings'],
  ['src/modules/reports/reports.router.ts', 'router', '/admin/reports'],
  ['src/modules/reports/reports.router.ts', 'companyReportsRouter', '/company/reports'],
  ['src/modules/notifications/notifications.router.ts', 'router', '/notifications'],
  ['src/modules/admins/admins.router.ts', 'router', '/admin/admins'],
];

const publicOperations = new Set([
  'get /health',
  'get /ready',
  'post /auth/register',
  'post /auth/worker/register',
  'post /auth/worker/request-otp',
  'post /auth/worker/complete-registration',
  'post /auth/worker/login',
  'post /auth/worker/forgot-password',
  'post /auth/worker/reset-password',
  'post /auth/company/register',
  'post /auth/company/complete-registration',
  'post /auth/company/login',
  'post /auth/company/web-login',
  'post /auth/company/web-refresh',
  'post /auth/company/web-logout',
  'post /auth/company/forgot-password',
  'post /auth/company/reset-password',
  'post /auth/admin/login',
  'post /auth/admin/web-login',
  'post /auth/admin/web-refresh',
  'post /auth/admin/web-logout',
  'post /auth/admin/forgot-password',
  'post /auth/verify-otp',
  'post /auth/refresh',
  'get /taxonomy',
  'get /taxonomy/positions',
  'get /private-worker-documents/{token}',
  'get /attendance/kiosk-sessions/context',
  'post /attendance/kiosk-sessions/qr-token',
  'get /attendance/venue-kiosks/context',
  'post /attendance/venue-kiosks/qr-token',
]);

function normalizeRoute(route) {
  const parameterized = route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const normalized = `/${parameterized}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function collectRuntimeRoutes() {
  const routes = new Set(['get /health', 'get /ready']);
  for (const [relativeFile, routerName, mount] of routerMounts) {
    const source = fs.readFileSync(path.join(root, relativeFile), 'utf8').replace(
      /\/\/ LOCAL_ONLY_KIOSK_LEGACY_START[\s\S]*?\/\/ LOCAL_ONLY_KIOSK_LEGACY_END/g,
      '',
    );
    const expression = new RegExp(
      `\\b${routerName}\\s*\\.\\s*(get|post|put|patch|delete)\\s*\\(\\s*['"]([^'"]+)['"]`,
      'g',
    );
    for (const match of source.matchAll(expression)) {
      routes.add(`${match[1].toLowerCase()} ${normalizeRoute(`${mount}${match[2]}`)}`);
    }
  }
  return routes;
}

function assertKioskCapabilityContract() {
  for (const route of [
    '/attendance/kiosk-sessions/context',
    '/attendance/kiosk-sessions/qr-token',
    '/attendance/venue-kiosks/context',
    '/attendance/venue-kiosks/qr-token',
  ]) {
    const operations = document.paths?.[route];
    assert.ok(operations, `missing kiosk capability route ${route}`);
    for (const operation of Object.values(operations)) {
      const capability = operation?.parameters?.find(
        (parameter) => parameter.name === 'X-Kiosk-Capability',
      );
      assert.equal(capability?.in, 'header', `${route} must carry its capability in a header`);
      assert.equal(capability?.required, true);
    }
  }

  assert.equal(document.paths?.['/attendance/kiosk-sessions/{token}'], undefined);
  assert.equal(document.paths?.['/attendance/kiosk-sessions/{token}/qr-token'], undefined);
  assert.equal(document.paths?.['/attendance/venue-kiosks/{token}'], undefined);
  assert.equal(document.paths?.['/attendance/venue-kiosks/{token}/qr-token'], undefined);
  assert.equal(
    document.components?.schemas?.VenueKioskPublicContext?.properties?.kiosk_url,
    undefined,
    'public kiosk context must never echo its capability URL',
  );
  assert.match(
    document.components?.schemas?.VenueKiosk?.allOf?.[1]?.properties?.kiosk_url?.example ?? '',
    /#capability=/,
  );
}

function collectSwaggerRoutes() {
  const routes = new Set();
  for (const [route, operations] of Object.entries(document.paths ?? {})) {
    for (const method of Object.keys(operations ?? {})) {
      if (httpMethods.has(method.toLowerCase())) {
        routes.add(`${method.toLowerCase()} ${normalizeRoute(route)}`);
      }
    }
  }
  return routes;
}

function operationFor(routeKey) {
  const separator = routeKey.indexOf(' ');
  const method = routeKey.slice(0, separator);
  const route = routeKey.slice(separator + 1);
  return document.paths?.[route]?.[method];
}

function resolvesToErrorSchema(response) {
  if (response?.$ref === '#/components/responses/Gone') return true;
  return response?.content?.['application/json']?.schema?.$ref === '#/components/schemas/Error';
}

function assertCoreContract() {
  assert.equal(document.openapi, '3.0.3');
  assert.ok(
    document.servers.some((server) => server.description === 'Production' && server.url.startsWith('https://')),
    'production server must use HTTPS',
  );
  assert.deepEqual(document.security, [], 'public-by-default security policy must be explicit');

  const bearer = document.components?.securitySchemes?.BearerAuth;
  assert.equal(bearer?.type, 'http');
  assert.equal(bearer?.scheme, 'bearer');
  assert.match(bearer?.description ?? '', /access token/i);
  assert.match(bearer?.description ?? '', /Refresh tokens are rejected/i);

  for (const name of ['XRequestId', 'XCorrelationId', 'RateLimitLimit', 'RateLimitRemaining', 'RateLimitReset', 'RetryAfter']) {
    assert.ok(document.components?.headers?.[name], `missing reusable header ${name}`);
  }

  const error = document.components?.schemas?.Error;
  assert.deepEqual(
    [...(error?.required ?? [])].sort(),
    ['code', 'error', 'request_id', 'timestamp'],
  );
  assert.equal(error?.properties?.request_id?.$ref, '#/components/schemas/RequestId');
  assert.equal(document.components?.schemas?.RequestId?.maxLength, 128);
}

function assertRouteAndSecurityContract() {
  const runtimeRoutes = collectRuntimeRoutes();
  const swaggerRoutes = collectSwaggerRoutes();
  assert.deepEqual(
    [...runtimeRoutes].filter((route) => !swaggerRoutes.has(route)).sort(),
    [],
    'runtime routes missing from swagger',
  );
  assert.deepEqual(
    [...swaggerRoutes].filter((route) => !runtimeRoutes.has(route)).sort(),
    [],
    'stale swagger routes',
  );

  for (const route of runtimeRoutes) {
    const operation = operationFor(route);
    const security = operation?.security ?? document.security;
    if (publicOperations.has(route)) {
      assert.deepEqual(security, [], `${route} must remain explicitly public/token-capability based`);
    } else {
      assert.ok(
        Array.isArray(security)
          && security.some((requirement) => Object.hasOwn(requirement, 'BearerAuth')),
        `${route} must require BearerAuth`,
      );
    }
  }
}

function assertAdminRecoveryContract() {
  const operation = document.paths?.['/auth/admin/forgot-password']?.post;
  assert.equal(operation?.deprecated, true);
  assert.equal(operation?.responses?.['200'], undefined);
  assert.ok(resolvesToErrorSchema(operation?.responses?.['410']));
  assert.match(operation?.responses?.['410']?.description ?? '', /ADMIN_PASSWORD_RESET_DISABLED/);
}

function assertPrivacyAndPrivateDocumentContract() {
  const accountDeletion = document.paths?.['/workers/me/account-deletion-request']?.post;
  assert.ok(accountDeletion?.security?.some((item) => Object.hasOwn(item, 'BearerAuth')));
  assert.equal(
    accountDeletion?.requestBody?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/WorkerAccountDeletionRequest',
  );
  assert.equal(
    accountDeletion?.responses?.['202']?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/WorkerAccountDeletionResponse',
  );
  assert.match(accountDeletion?.description ?? '', /no database row is hard-deleted/);

  const authorizeDownload = document.paths?.['/workers/{id}/documents/{type}/download']?.get;
  assert.ok(authorizeDownload?.security?.some((item) => Object.hasOwn(item, 'BearerAuth')));
  assert.match(authorizeDownload?.description ?? '', /must not be logged, persisted/i);
  assert.equal(
    authorizeDownload?.responses?.['200']?.content?.['application/json']?.schema
      ?.properties?.expires_in_seconds?.maximum,
    900,
  );
  assert.ok(authorizeDownload?.responses?.['410']);
  assert.match(
    authorizeDownload?.responses?.['200']?.headers?.['Cache-Control']?.description ?? '',
    /no-store/,
  );

  const localCapability = document.paths?.['/private-worker-documents/{token}']?.get;
  assert.deepEqual(localCapability?.security, []);
  assert.match(localCapability?.description ?? '', /must not be logged, persisted/i);
  assert.match(localCapability?.responses?.['200']?.headers?.['Cache-Control']?.description ?? '', /no-store/);

  const metadata = document.components?.schemas?.WorkerDocumentMetadata;
  assert.equal(metadata?.properties?.object_key, undefined);
  assert.match(metadata?.description ?? '', /permanent public URLs are never returned/i);
}

function assertOrderContract() {
  const statuses = document.components?.schemas?.OrderStatus?.enum ?? [];
  assert.deepEqual(statuses, [
    'draft',
    'active',
    'published',
    'partially_assigned',
    'assigned',
    'in_progress',
    'completed',
    'cancelled',
  ]);
  assert.equal(
    document.components?.schemas?.Order?.properties?.status?.$ref,
    '#/components/schemas/OrderStatus',
  );
  assert.equal(document.components?.schemas?.Order?.properties?.version?.minimum, 1);
  assert.equal(document.components?.schemas?.CancelOrderRequest?.properties?.expected_version?.minimum, 1);

  const createOrder = document.paths?.['/orders']?.post;
  const idempotency = createOrder?.parameters?.find((parameter) => parameter.name === 'Idempotency-Key');
  assert.equal(idempotency?.in, 'header');
  assert.equal(idempotency?.schema?.minLength, 8);
  assert.match(createOrder?.description ?? '', /24 hours/);
  assert.match(createOrder?.responses?.['409']?.description ?? '', /IDEMPOTENCY_REQUEST_IN_PROGRESS/);

  const cancelOrder = document.paths?.['/orders/{id}/cancel']?.patch;
  assert.equal(
    cancelOrder?.requestBody?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/CancelOrderRequest',
  );
  assert.match(cancelOrder?.responses?.['409']?.description ?? '', /ORDER_VERSION_CONFLICT/);
}

function assertPaginationContract() {
  const pagination = document.components?.schemas?.PaginationMeta;
  assert.ok(['page', 'limit', 'total', 'total_pages'].every((field) => field in pagination.properties));

  const notifications = document.paths?.['/notifications']?.get;
  const orders = document.paths?.['/orders']?.get;
  for (const operation of [notifications, orders]) {
    const refs = new Set((operation?.parameters ?? []).map((parameter) => parameter.$ref));
    assert.ok(refs.has('#/components/parameters/Page'));
    assert.ok(refs.has('#/components/parameters/Limit'));
    assert.ok(operation?.responses?.['200']?.content?.['application/json']?.schema?.$ref);
  }
}

function assertProductionDocsPolicy() {
  const source = fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8');
  assert.match(source, /const docsEnabled = !isProduction/);
  assert.match(source, /SWAGGER_DOCS_ENABLED !== 'false'/);
}

assertCoreContract();
assertRouteAndSecurityContract();
assertKioskCapabilityContract();
assertAdminRecoveryContract();
assertPrivacyAndPrivateDocumentContract();
assertOrderContract();
assertPaginationContract();
assertProductionDocsPolicy();

console.log('swagger-security-regression: OK');
