import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

const root = process.cwd();
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
      `\\b${routerName}\\s*\\.\\s*(get|post|put|patch|delete)\\s*\\(\\s*['\"]([^'\"]+)['\"]`,
      'g',
    );

    for (const match of source.matchAll(expression)) {
      // swagger.yaml uses a /v1 server base, so compare router-relative paths.
      routes.add(`${match[1].toLowerCase()} ${normalizeRoute(`${mount}${match[2]}`)}`);
    }
  }

  return routes;
}

function collectSwaggerRoutes() {
  const document = yaml.load(fs.readFileSync(path.join(root, 'swagger.yaml'), 'utf8'));
  const routes = new Set();

  for (const [route, operations] of Object.entries(document?.paths ?? {})) {
    for (const method of Object.keys(operations ?? {})) {
      if (httpMethods.has(method.toLowerCase())) {
        routes.add(`${method.toLowerCase()} ${normalizeRoute(route)}`);
      }
    }
  }

  return routes;
}

const runtimeRoutes = collectRuntimeRoutes();
const swaggerRoutes = collectSwaggerRoutes();
const missingFromSwagger = [...runtimeRoutes].filter((route) => !swaggerRoutes.has(route)).sort();
const staleInSwagger = [...swaggerRoutes].filter((route) => !runtimeRoutes.has(route)).sort();

if (missingFromSwagger.length || staleInSwagger.length) {
  if (missingFromSwagger.length) {
    console.error('Runtime routes missing from swagger.yaml:');
    for (const route of missingFromSwagger) console.error(`  - ${route}`);
  }
  if (staleInSwagger.length) {
    console.error('Swagger operations without a matching runtime route:');
    for (const route of staleInSwagger) console.error(`  - ${route}`);
  }
  process.exit(1);
}

console.log(`Swagger drift check passed (${runtimeRoutes.size} path/method operations).`);
