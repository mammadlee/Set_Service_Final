const { randomBytes } = require('node:crypto');

type Json = Record<string, any>;

type Tokens = {
  accessToken: string;
  refreshToken: string;
};

type StepContext = {
  critical?: boolean;
};

type HttpResult = {
  response: Response;
  json: any;
};

type SmokePosition = {
  id: string;
  slug: string;
  name_az: string;
  department_id: string;
  subdepartment_id: string;
};

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TEST_OTP = process.env.TEST_OTP ?? '123456';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@setservice.az';
const ADMIN_PASSWORD = requiredSmokePassword('SMOKE_ADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD');
const REPORTS_ADMIN_EMAIL = process.env.SMOKE_REPORTS_ADMIN_EMAIL ?? process.env.SEED_REPORTS_ADMIN_EMAIL ?? 'reports@setservice.az';
const RESTRICTED_ADMIN_PASSWORD = process.env.SMOKE_RESTRICTED_ADMIN_PASSWORD ?? process.env.SEED_RESTRICTED_ADMIN_PASSWORD ?? ADMIN_PASSWORD;
const COMPANY_EMAIL = process.env.SMOKE_COMPANY_EMAIL ?? process.env.SEED_COMPANY_EMAIL ?? 'company@setservice.az';
const COMPANY_PASSWORD = requiredSmokePassword('SMOKE_COMPANY_PASSWORD', 'SEED_COMPANY_PASSWORD');
const WORKER_PASSWORD = process.env.SMOKE_WORKER_PASSWORD ?? randomSmokePassword();
const AUDIT_ADMIN_PASSWORD = process.env.SMOKE_AUDIT_ADMIN_PASSWORD ?? randomSmokePassword();
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const RATE_LIMIT_MAX_RETRIES = Number(process.env.SMOKE_RATE_LIMIT_RETRIES ?? 3);
const RATE_LIMIT_FALLBACK_WAIT_SECONDS = Number(process.env.SMOKE_RATE_LIMIT_FALLBACK_SECONDS ?? 10);
const RATE_LIMIT_BUFFER_SECONDS = 1;
const RATE_LIMIT_MAX_WAIT_SECONDS = Number(process.env.SMOKE_MAX_RATE_LIMIT_WAIT_SECONDS ?? 5);
const SKIP_RATE_LIMIT_WAIT = process.env.SMOKE_SKIP_RATE_LIMIT_WAIT === 'true';

let failures = 0;

function requiredSmokePassword(...envNames: string[]): string {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  throw new Error(`Smoke password is required. Set one of: ${envNames.join(', ')}`);
}

function randomSmokePassword(): string {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

function endpoint(path: string): string {
  const base = BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (cleanPath === '/health') {
    return base.endsWith('/v1') ? `${base.slice(0, -3)}/health` : `${base}/health`;
  }

  const apiBase = base.endsWith('/v1') ? base : `${base}/v1`;
  return `${apiBase}${cleanPath}`;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }

  const value = search.toString();
  return value ? `?${value}` : '';
}

function createPhone(offset = 0): string {
  const suffix = String((Number(RUN_ID.slice(-8)) + offset) % 10000000).padStart(7, '0');
  return `+994${suffix}`;
}

function futureWindow(offsetHours: number, durationHours: number) {
  const start = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

  return {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  };
}

function dateOnlyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function requestUrl(
  method: string,
  path: string,
  body?: Json,
  token?: string,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...extraHeaders,
  };

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json: any = undefined;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { response, json };
}

async function requestMultipart(
  path: string,
  formData: FormData,
  token: string,
): Promise<{ response: Response; json: any }> {
  const response = await fetch(endpoint(path), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const text = await response.text();
  let json: any = undefined;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { response, json };
}

function get(path: string, token?: string) {
  return requestUrl('GET', path, undefined, token);
}

function post(path: string, body?: Json, token?: string) {
  return requestUrl('POST', path, body, token);
}

function getWithKioskCapability(path: string, capability: string) {
  return requestUrl('GET', path, undefined, undefined, {
    'x-kiosk-capability': capability,
  });
}

function postWithKioskCapability(path: string, capability: string) {
  return requestUrl('POST', path, undefined, undefined, {
    'x-kiosk-capability': capability,
  });
}

function postAuthFlow(path: string, body?: Json, token?: string) {
  return requestWithRateLimitRetry('POST', path, body, token);
}

function patch(path: string, body?: Json, token?: string) {
  return requestUrl('PATCH', path, body, token);
}

function del(path: string, body?: Json, token?: string) {
  return requestUrl('DELETE', path, body, token);
}

async function requestWithRateLimitRetry(
  method: string,
  path: string,
  body?: Json,
  token?: string,
): Promise<HttpResult> {
  const maxRetries = Number.isFinite(RATE_LIMIT_MAX_RETRIES) && RATE_LIMIT_MAX_RETRIES >= 0
    ? RATE_LIMIT_MAX_RETRIES
    : 3;

  for (let attempt = 0; ; attempt += 1) {
    const result = await requestUrl(method, path, body, token);

    if (result.response.status !== 429) {
      return result;
    }

    if (findErrorCode(result.json) === 'OTP_COOLDOWN') {
      return result;
    }

    if (attempt >= maxRetries) {
      throw new Error(
        `Rate limit still active after ${maxRetries} retry attempt(s) for ${method} ${path}. Response: ${JSON.stringify(result.json)}`,
      );
    }

    const waitSeconds = getRetryAfterSeconds(result);
    const maxWaitSeconds = getMaxRateLimitWaitSeconds();
    if (SKIP_RATE_LIMIT_WAIT || waitSeconds > maxWaitSeconds) {
      throw new Error(
        [
          `Rate limit hit for ${method} ${path}. Server requested wait ${waitSeconds}s,`,
          `which exceeds SMOKE_MAX_RATE_LIMIT_WAIT_SECONDS=${maxWaitSeconds}.`,
          'Verification flow will not sleep for a long production limiter window.',
          'Run again after the limiter window clears, seed an approved worker, or raise SMOKE_MAX_RATE_LIMIT_WAIT_SECONDS intentionally.',
        ].join(' '),
      );
    }

    process.stdout.write(`(429 rate limit; waiting ${waitSeconds}s before retry ${attempt + 1}/${maxRetries}) `);
    await sleep(waitSeconds * 1000);
  }
}

function getRetryAfterSeconds(result: HttpResult): number {
  const detailRetry = Number(result.json?.details?.retry_after_seconds ?? result.json?.retry_after_seconds);
  if (Number.isFinite(detailRetry) && detailRetry > 0) {
    return Math.ceil(detailRetry) + RATE_LIMIT_BUFFER_SECONDS;
  }

  const retryAfterHeader = Number(result.response.headers.get('retry-after'));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
    return Math.ceil(retryAfterHeader) + RATE_LIMIT_BUFFER_SECONDS;
  }

  const fallback = Number.isFinite(RATE_LIMIT_FALLBACK_WAIT_SECONDS) && RATE_LIMIT_FALLBACK_WAIT_SECONDS > 0
    ? RATE_LIMIT_FALLBACK_WAIT_SECONDS
    : 10;
  return Math.ceil(fallback);
}

function getMaxRateLimitWaitSeconds(): number {
  if (Number.isFinite(RATE_LIMIT_MAX_WAIT_SECONDS) && RATE_LIMIT_MAX_WAIT_SECONDS >= 0) {
    return Math.ceil(RATE_LIMIT_MAX_WAIT_SECONDS);
  }

  return 5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function step<T>(
  name: string,
  callback: () => Promise<T>,
  context: StepContext = { critical: true },
): Promise<T | undefined> {
  process.stdout.write(`- ${name} ... `);

  try {
    const result = await callback();
    console.log('PASS');
    return result;
  } catch (error) {
    failures += 1;
    console.log('FAIL');

    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(`  ${String(error)}`);
    }

    if (context.critical !== false) {
      console.error('\nCritical step failed. Stopping verification flow.');
      process.exit(1);
    }

    return undefined;
  }
}

function expectStatus(response: Response, json: any, expected: number | number[]) {
  const allowed = Array.isArray(expected) ? expected : [expected];

  if (!allowed.includes(response.status)) {
    throw new Error(
      `Expected status ${allowed.join('/')} but got ${response.status}. Response: ${JSON.stringify(json)}`,
    );
  }
}

function expectObject(value: any, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object. Received: ${JSON.stringify(value)}`);
  }

  return value;
}

function expectArray(value: any, label: string): any[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array. Received: ${JSON.stringify(value)}`);
  }

  return value;
}

function expectString(value: any, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string. Received: ${JSON.stringify(value)}`);
  }

  return value;
}

function expectNumber(value: any, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected ${label} to be a number. Received: ${JSON.stringify(value)}`);
  }

  return value;
}

function expectEqual(actual: any, expected: any, label: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to equal ${JSON.stringify(expected)}. Received: ${JSON.stringify(actual)}`);
  }
}

function expectAtLeast(actual: number, min: number, label: string) {
  if (actual < min) {
    throw new Error(`Expected ${label} to be at least ${min}. Received: ${actual}`);
  }
}

function expectNoKey(value: Json, key: string, label: string) {
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    throw new Error(`Expected ${label} not to expose ${key}. Received: ${JSON.stringify(value)}`);
  }
}

function findErrorCode(json: any): string | undefined {
  if (!json || typeof json !== 'object') {
    return undefined;
  }

  if (typeof json.code === 'string') {
    return json.code;
  }

  if (typeof json.error?.code === 'string') {
    return json.error.code;
  }

  return undefined;
}

function expectErrorCode(json: any, expectedCode: string) {
  const code = findErrorCode(json);

  if (code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode} but got ${code ?? 'none'}. Response: ${JSON.stringify(json)}`);
  }
}

function expectContains(value: any, needle: string, label: string) {
  const text = JSON.stringify(value);

  if (!text.includes(needle)) {
    throw new Error(`Expected ${label} to contain "${needle}". Received: ${text}`);
  }
}

function parseTokens(json: any, label: string): Tokens {
  const payload = expectObject(json, label);
  const accessToken = payload.access_token ?? payload.accessToken;
  const refreshToken = payload.refresh_token ?? payload.refreshToken;

  return {
    accessToken: expectString(accessToken, `${label}.access_token`),
    refreshToken: expectString(refreshToken, `${label}.refresh_token`),
  };
}

function unwrapData(json: any): any {
  if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data')) {
    return json.data;
  }

  return json;
}

function listData(json: any, label: string): any[] {
  const data = unwrapData(json);

  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    for (const key of ['items', 'workers', 'orders', 'assignments', 'attendance', 'ratings', 'notifications']) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  return expectArray(data, label);
}

function firstIdFrom(collection: any[], label: string): string {
  const item = collection.find((entry) => typeof entry?.id === 'string');
  return expectString(item?.id, label);
}

function makeProfileImageForm(): FormData {
  const form = new FormData();
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  ]);

  form.append('file', new Blob([png], { type: 'image/png' }), `set-service-profil-${RUN_ID}.png`);
  return form;
}

function makeDocumentForm(type: string): FormData {
  const form = new FormData();
  const pdf = Buffer.from('%PDF-1.4\n% SET Service worker document\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

  form.append('type', type);
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), `set-service-sened-${RUN_ID}.pdf`);
  return form;
}

async function registerVerifyApproveWorker(
  phone: string,
  fullName: string,
  adminToken: string,
  positionId?: string,
): Promise<string> {
  const register = await postAuthFlow('/auth/worker/register', {
    full_name: fullName,
    phone,
    position: 'Ofisiant',
    ...(positionId ? { position_ids: [positionId] } : {}),
    skills: ['Servis', 'Banket xidməti'],
    languages: ['Azərbaycan'],
  });
  expectStatus(register.response, register.json, 201);
  const workerId = expectString(
    unwrapData(register.json)?.worker_id ?? unwrapData(register.json)?.id ?? register.json?.worker_id ?? register.json?.id,
    'registered worker id',
  );

  const verify = await postAuthFlow('/auth/worker/complete-registration', {
    phone,
    otp_code: TEST_OTP,
    password: WORKER_PASSWORD,
  });
  expectStatus(verify.response, verify.json, 200);

  const approve = await patch(`/admin/workers/${workerId}/approve`, {}, adminToken);
  expectStatus(approve.response, approve.json, 200);

  return workerId;
}

async function loginWorkerWithPassword(phone: string): Promise<Tokens> {
  const login = await postAuthFlow('/auth/worker/login', { phone, password: WORKER_PASSWORD });
  expectStatus(login.response, login.json, 200);
  return parseTokens(login.json, 'worker login');
}

async function loginCompanyWithPassword(): Promise<Tokens> {
  const login = await postAuthFlow('/auth/company/login', { email: COMPANY_EMAIL, password: COMPANY_PASSWORD });
  expectStatus(login.response, login.json, 200);
  return parseTokens(login.json, 'company login');
}

async function loginAdminWithPassword(): Promise<Tokens> {
  const login = await postAuthFlow('/auth/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  expectStatus(login.response, login.json, 200);
  return parseTokens(login.json, 'admin login');
}

async function loginRestrictedAdminWithPassword(email: string, password = RESTRICTED_ADMIN_PASSWORD): Promise<Tokens> {
  const login = await postAuthFlow('/auth/admin/login', { email, password });
  expectStatus(login.response, login.json, 200);
  const user = expectObject(login.json?.user, 'restricted admin user');
  expectEqual(user.role, 'admin', 'restricted admin role');
  return parseTokens(login.json, 'restricted admin login');
}

async function getPositionBySlug(slug: string): Promise<SmokePosition> {
  const { response, json } = await get('/taxonomy/positions');
  expectStatus(response, json, 200);
  const positions = expectArray(json?.data, 'taxonomy positions');
  const position = positions.find((item: Json) => item.slug === slug);
  if (!position) throw new Error(`Seeded taxonomy position not found: ${slug}`);
  return {
    id: expectString(position.id, `${slug} id`),
    slug: expectString(position.slug, `${slug} slug`),
    name_az: expectString(position.name_az, `${slug} name_az`),
    department_id: expectString(position.department_id, `${slug} department_id`),
    subdepartment_id: expectString(position.subdepartment_id, `${slug} subdepartment_id`),
  };
}

function orderItemFor(position: SmokePosition, requiredCount: number, notes?: string) {
  return {
    category: position.name_az,
    department_id: position.department_id,
    subdepartment_id: position.subdepartment_id,
    position_id: position.id,
    required_count: requiredCount,
    ...(notes ? { notes } : {}),
  };
}

async function findExistingApprovedWorker(
  adminToken: string,
  excludedWorkerIds: string[],
  requiredPositionId?: string,
): Promise<string | null> {
  const { response, json } = await get('/admin/workers?status=approved&limit=50', adminToken);
  expectStatus(response, json, 200);

  const workers = listData(json, 'approved workers');
  const worker = workers.find((item) => {
    if (!item || typeof item.id !== 'string') return false;
    if (excludedWorkerIds.includes(item.id)) return false;
    if (item.status !== 'approved') return false;
    if (requiredPositionId && !Array.isArray(item.position_ids)) return false;
    if (requiredPositionId && !item.position_ids.includes(requiredPositionId)) return false;
    return item.availability !== false;
  });

  return typeof worker?.id === 'string' ? worker.id : null;
}

async function main() {
  console.log(`SET Service full-system verification flow`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`TEST_OTP_CONFIGURED=${TEST_OTP.length > 0}`);
  console.log(`RUN_ID=${RUN_ID}\n`);

  const workerPhone = createPhone(1);
  const capacityWorkerPhone = createPhone(2);
  const approvalCompanyPhone = createPhone(3);
  const bruteForceWorkerPhone = createPhone(4);
  const approvalCompanyEmail = `approval-${RUN_ID}@setservice.az`;
  const workerName = 'Elvin Məmmədov';
  const capacityWorkerName = 'Murad Əliyev';

  let workerId!: string;
  let workerOtpChallenge!: string;
  let approvalCompanyId!: string;
  let approvalCompanyOtpChallenge!: string;
  let capacityWorkerId!: string;
  let adminTokens!: Tokens;
  let workerTokens!: Tokens;
  let companyTokens!: Tokens;
  let companyId!: string;
  let orderId!: string;
  let assignmentId!: string;
  let attendanceId!: string;
  let venueKioskId!: string;
  let venueKioskToken!: string;
  let multiOrderId!: string;
  let firstCategoryItemId!: string;
  let firstCategoryName!: string;
  let multiAssignmentId!: string;
  let ratingId!: string;
  let waiterPosition!: SmokePosition;
  let bartenderPosition!: SmokePosition;

  await step('Health check', async () => {
    const { response, json } = await get('/health');
    expectStatus(response, json, 200);
  });

  await step('Public taxonomy exposes seeded positions', async () => {
    waiterPosition = await getPositionBySlug('waiter-waitress');
    bartenderPosition = await getPositionBySlug('bartender');
  });

  await step('Worker register', async () => {
    const { response, json } = await postAuthFlow('/auth/worker/register', {
      full_name: workerName,
      phone: workerPhone,
      position: 'Ofisiant',
      position_ids: [waiterPosition.id],
      skills: ['Servis', 'Hospitality'],
      languages: ['Azərbaycan', 'English'],
    });

    expectStatus(response, json, 201);
    workerId = expectString(unwrapData(json)?.worker_id ?? unwrapData(json)?.id ?? json?.worker_id ?? json?.id, 'worker id');
  });

  await step('Worker OTP verification alone does not make the account approvable', async () => {
    const verify = await postAuthFlow('/auth/verify-otp', {
      phone: workerPhone,
      otp_code: TEST_OTP,
      purpose: 'worker_registration',
    });
    expectStatus(verify.response, verify.json, 200);
    const payload = expectObject(unwrapData(verify.json), 'worker OTP verification');
    expectEqual(payload.status, 'pending_otp', 'worker status before password creation');
    workerOtpChallenge = expectString(payload.otp_challenge, 'worker OTP challenge');

    adminTokens = await loginAdminWithPassword();
    const approval = await patch(`/admin/workers/${workerId}/approve`, {}, adminTokens.accessToken);
    expectStatus(approval.response, approval.json, 409);
    expectErrorCode(approval.json, 'REGISTRATION_INCOMPLETE');
  });

  await step('Worker registration OTP verify and password creation', async () => {
    const { response, json } = await postAuthFlow('/auth/worker/complete-registration', {
      phone: workerPhone,
      otp_challenge: workerOtpChallenge,
      password: WORKER_PASSWORD,
    });

    expectStatus(response, json, 200);
    const status = unwrapData(json)?.worker?.status ?? unwrapData(json)?.status ?? json?.status;
    expectEqual(status, 'pending_approval', 'worker status after registration OTP');
  });

  await step('Worker login blocked while pending approval', async () => {
    const login = await postAuthFlow('/auth/worker/login', { phone: workerPhone, password: WORKER_PASSWORD });
    expectStatus(login.response, login.json, 403);
    expectErrorCode(login.json, 'WORKER_NOT_APPROVED');
  });

  await step('Super admin can create restricted admin and permissions are enforced', async () => {
    const email = `audit-${RUN_ID}@setservice.az`;
    const create = await post(
      '/admin/admins',
      {
        name: 'Audit Admin',
        email,
        password: AUDIT_ADMIN_PASSWORD,
        is_active: true,
        permissions: ['manage_assignments'],
      },
      adminTokens.accessToken,
    );
    expectStatus(create.response, create.json, 201);
    const createdAdmin = expectObject(unwrapData(create.json), 'created restricted admin');
    expectEqual(createdAdmin.role, 'admin', 'created restricted admin role');
    const createdPermissions = expectArray(createdAdmin.permissions, 'created restricted admin permissions');
    for (const permission of ['view_assignments', 'view_orders', 'view_workers', 'manage_assignments']) {
      if (!createdPermissions.includes(permission)) {
        throw new Error(`Expected normalized restricted admin permission ${permission}`);
      }
    }

    const restrictedTokens = await loginRestrictedAdminWithPassword(email, AUDIT_ADMIN_PASSWORD);
    const allowed = await get('/assignments', restrictedTokens.accessToken);
    expectStatus(allowed.response, allowed.json, 200);

    const forbidden = await get('/attendance', restrictedTokens.accessToken);
    expectStatus(forbidden.response, forbidden.json, 403);
    expectErrorCode(forbidden.json, 'PERMISSION_DENIED');

    const deactivate = await patch(`/admin/admins/${createdAdmin.id}`, { is_active: false }, adminTokens.accessToken);
    expectStatus(deactivate.response, deactivate.json, 200);

    const staleTokenDenied = await get('/assignments', restrictedTokens.accessToken);
    expectStatus(staleTokenDenied.response, staleTokenDenied.json, 403);
    expectErrorCode(staleTokenDenied.json, 'ADMIN_ACCOUNT_INACTIVE');
  });

  await step('Seeded reports admin can access reports but not attendance', async () => {
    const reportsTokens = await loginRestrictedAdminWithPassword(REPORTS_ADMIN_EMAIL);
    const report = await get('/admin/reports/summary', reportsTokens.accessToken);
    expectStatus(report.response, report.json, 200);

    const forbidden = await get('/attendance', reportsTokens.accessToken);
    expectStatus(forbidden.response, forbidden.json, 403);
    expectErrorCode(forbidden.json, 'PERMISSION_DENIED');
  }, { critical: false });

  await step('Admin approves worker', async () => {
    const { response, json } = await patch(`/admin/workers/${workerId}/approve`, {}, adminTokens.accessToken);
    expectStatus(response, json, 200);
    const status = unwrapData(json)?.status ?? json?.status;
    expectEqual(status, 'approved', 'worker status after approval');
  });

  await step('Worker login with phone and password after approval', async () => {
    workerTokens = await loginWorkerWithPassword(workerPhone);
  });

  await step('Access and refresh tokens are not interchangeable', async () => {
    const refreshAsAccess = await get('/workers/me', workerTokens.refreshToken);
    expectStatus(refreshAsAccess.response, refreshAsAccess.json, 401);

    const accessAsRefresh = await postAuthFlow('/auth/refresh', { refresh_token: workerTokens.accessToken });
    expectStatus(accessAsRefresh.response, accessAsRefresh.json, 401);
    expectErrorCode(accessAsRefresh.json, 'INVALID_REFRESH_TOKEN');
  });

  await step('Refresh token rotation rejects reuse', async () => {
    const previousRefreshToken = workerTokens.refreshToken;
    const rotated = await postAuthFlow('/auth/refresh', { refresh_token: previousRefreshToken });
    expectStatus(rotated.response, rotated.json, 200);
    workerTokens = parseTokens(rotated.json, 'rotated worker session');

    const reused = await postAuthFlow('/auth/refresh', { refresh_token: previousRefreshToken });
    expectStatus(reused.response, reused.json, 401);
    expectErrorCode(reused.json, 'REFRESH_TOKEN_REUSE');

    const familyRevoked = await postAuthFlow('/auth/refresh', { refresh_token: workerTokens.refreshToken });
    expectStatus(familyRevoked.response, familyRevoked.json, 401);
    expectErrorCode(familyRevoked.json, 'INVALID_REFRESH_TOKEN');

    const me = await get('/workers/me', workerTokens.accessToken);
    expectStatus(me.response, me.json, 200);
  });

  await step('Company OTP verification alone does not make the account approvable', async () => {
    const registration = await postAuthFlow('/auth/company/register', {
      name: `Approval Test Company ${RUN_ID}`,
      contact_name: 'Approval Test Contact',
      email: approvalCompanyEmail,
      phone: approvalCompanyPhone,
    });
    expectStatus(registration.response, registration.json, 201);
    approvalCompanyId = expectString(
      unwrapData(registration.json)?.company_id ?? registration.json?.company_id,
      'approval test company id',
    );

    const verify = await postAuthFlow('/auth/verify-otp', {
      phone: approvalCompanyPhone,
      otp_code: TEST_OTP,
      purpose: 'company_registration',
    });
    expectStatus(verify.response, verify.json, 200);
    const payload = expectObject(unwrapData(verify.json), 'company OTP verification');
    approvalCompanyOtpChallenge = expectString(payload.otp_challenge, 'company OTP challenge');

    const approval = await patch(`/admin/companies/${approvalCompanyId}/approve`, {}, adminTokens.accessToken);
    expectStatus(approval.response, approval.json, 409);
    expectErrorCode(approval.json, 'REGISTRATION_INCOMPLETE');
  });

  await step('Company becomes approvable only after password creation', async () => {
    const completion = await postAuthFlow('/auth/company/complete-registration', {
      email: approvalCompanyEmail,
      otp_challenge: approvalCompanyOtpChallenge,
      password: WORKER_PASSWORD,
    });
    expectStatus(completion.response, completion.json, 200);

    const approval = await patch(`/admin/companies/${approvalCompanyId}/approve`, {}, adminTokens.accessToken);
    expectStatus(approval.response, approval.json, 200);

    const login = await postAuthFlow('/auth/company/login', {
      email: approvalCompanyEmail,
      password: WORKER_PASSWORD,
    });
    expectStatus(login.response, login.json, 200);
    parseTokens(login.json, 'approval test company login');
  });

  await step('Company login with email and password', async () => {
    companyTokens = await loginCompanyWithPassword();
    const me = await get('/companies/me', companyTokens.accessToken);
    expectStatus(me.response, me.json, 200);
    companyId = expectString(unwrapData(me.json)?.id ?? me.json?.id, 'company id');
  });

  await step('Company creates single-category order', async () => {
    const dates = futureWindow(24, 8);
    const { response, json } = await post(
      '/orders',
      {
        title: 'Hilton Baku banket xidməti',
        description: 'Hilton Baku üçün axşam banketində premium servis dəstəyi.',
        category: waiterPosition.name_az,
        required_count: 1,
        category_items: [orderItemFor(waiterPosition, 1)],
        start_datetime: dates.start_date,
        end_datetime: dates.end_date,
        location: 'Hilton Baku, Bakı',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const order = expectObject(unwrapData(json), 'created order');
    orderId = expectString(order.id, 'order id');
    expectEqual(order.category, waiterPosition.name_az, 'single order category');
    expectEqual(order.required_count, 1, 'single order required count');
  });

  await step('Super admin assigns worker to order', async () => {
    const { response, json } = await post(
      '/assignments',
      {
        order_id: orderId,
        worker_ids: [workerId],
      },
      adminTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const assignments = listData(json, 'assignment create response');
    assignmentId = firstIdFrom(assignments, 'created assignment id');
  });

  await step('Worker accepts assignment', async () => {
    const { response, json } = await patch(`/assignments/${assignmentId}/accept`, {}, workerTokens.accessToken);
    expectStatus(response, json, 200);
    const status = unwrapData(json)?.status ?? json?.status;
    expectEqual(status, 'accepted', 'assignment status after accept');
  });

  let qrToken!: string;

  await step('Company generates attendance QR token with display context', async () => {
    const { response, json } = await post(
      '/attendance/qr-token',
      {
        assignment_id: assignmentId,
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 200);
    const qr = expectObject(unwrapData(json), 'attendance QR token');
    qrToken = expectString(qr.token, 'QR token');
    expectEqual(qr.assignment_id, assignmentId, 'QR assignment id');
    expectEqual(qr.order_id, orderId, 'QR order id');
    expectEqual(qr.company_id, companyId, 'QR company id');
    expectString(qr.order_title, 'QR order title');
    expectString(qr.company_name, 'QR company name');
    expectEqual(qr.refresh_after_seconds, 30, 'QR refresh_after_seconds');
    expectString(qr.expires_at, 'QR expires_at');
  });

  await step('Company creates persistent venue kiosk link', async () => {
    const { response, json } = await post(
      '/attendance/venue-kiosks',
      {
        name: 'Hilton əsas giriş',
        location_label: 'Lobby / əsas giriş',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const kiosk = expectObject(unwrapData(json), 'venue kiosk');
    venueKioskId = expectString(kiosk.id, 'venue kiosk id');
    venueKioskToken = expectString(kiosk.kiosk_token, 'venue kiosk token');
    expectString(kiosk.kiosk_url, 'kiosk url');
    expectEqual(kiosk.company_id, companyId, 'kiosk company id');
    expectEqual(kiosk.kiosk_status, 'active', 'kiosk status');
    expectEqual(kiosk.active_session ?? null, null, 'initial kiosk active session');
    expectEqual(kiosk.refresh_interval_seconds, 30, 'kiosk refresh interval');
  });

  await step('Inactive venue kiosk waits until admin/company activation', async () => {
    const context = await getWithKioskCapability(
      '/attendance/venue-kiosks/context',
      venueKioskToken,
    );
    expectStatus(context.response, context.json, 200);
    const kioskContext = expectObject(unwrapData(context.json), 'public kiosk context');
    expectEqual(kioskContext.company_id, companyId, 'public kiosk company id');
    expectEqual(kioskContext.active_session ?? null, null, 'public kiosk active session');
    expectNoKey(kioskContext, 'kiosk_token', 'public kiosk context');
    expectNoKey(kioskContext, 'kiosk_url', 'public kiosk context');

    const qrBeforeActivation = await postWithKioskCapability(
      '/attendance/venue-kiosks/qr-token',
      venueKioskToken,
    );
    expectStatus(qrBeforeActivation.response, qrBeforeActivation.json, 409);
    expectErrorCode(qrBeforeActivation.json, 'KIOSK_WAITING_FOR_ACTIVE_ORDER');
  });

  await step('Company activates order on persistent venue kiosk', async () => {
    const activate = await post(
      `/attendance/venue-kiosks/${venueKioskId}/activate`,
      { order_id: orderId },
      companyTokens.accessToken,
    );
    expectStatus(activate.response, activate.json, 200);
    const kiosk = expectObject(unwrapData(activate.json), 'activated venue kiosk');
    expectEqual(kiosk.active_session?.order_id, orderId, 'active kiosk order id');
  });

  await step('Public venue kiosk context and 30-second QR generation work', async () => {
    const context = await getWithKioskCapability(
      '/attendance/venue-kiosks/context',
      venueKioskToken,
    );
    expectStatus(context.response, context.json, 200);
    const kioskContext = expectObject(unwrapData(context.json), 'public venue kiosk context');
    expectEqual(kioskContext.active_session?.order_id, orderId, 'public active kiosk order id');
    expectNoKey(kioskContext, 'kiosk_token', 'public venue kiosk context');
    expectNoKey(kioskContext, 'kiosk_url', 'public venue kiosk context');

    const qrResponse = await postWithKioskCapability(
      '/attendance/venue-kiosks/qr-token',
      venueKioskToken,
    );
    expectStatus(qrResponse.response, qrResponse.json, 200);
    const kioskQr = expectObject(unwrapData(qrResponse.json), 'public kiosk QR token');
    qrToken = expectString(kioskQr.token, 'public kiosk attendance QR token');
    expectNoKey(kioskQr, 'assignment_id', 'order-based public kiosk QR token');
    expectEqual(kioskQr.order_id, orderId, 'public kiosk QR order id');
    expectEqual(kioskQr.refresh_after_seconds, 30, 'public kiosk QR refresh_after_seconds');
    expectString(kioskQr.expires_at, 'public kiosk QR expires_at');
  });

  await step('Worker checks in', async () => {
    const { response, json } = await post(
      '/attendance/check-in',
      {
        qr_token: qrToken,
        location: { address: 'Hilton Baku əsas zal' },
      },
      workerTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const attendance = expectObject(unwrapData(json), 'attendance check-in');
    attendanceId = expectString(attendance.id, 'attendance id');
    expectString(attendance.checkin_time, 'attendance checkin_time');
  });

  await step('Duplicate check-in returns expected 409', async () => {
    const { response, json } = await post(
      '/attendance/check-in',
      {
        qr_token: qrToken,
      },
      workerTokens.accessToken,
    );

    expectStatus(response, json, 409);
    expectErrorCode(json, 'ATTENDANCE_ALREADY_CHECKED_IN');
  });

  await step('Worker checks out', async () => {
    const { response, json } = await post(
      '/attendance/check-out',
      {
        qr_token: qrToken,
        notes: 'Checkout tamamlandı',
      },
      workerTokens.accessToken,
    );

    expectStatus(response, json, 200);
    const attendance = expectObject(unwrapData(json), 'attendance checkout');
    expectEqual(attendance.id, attendanceId, 'checkout attendance id');
    expectString(attendance.checkout_time, 'attendance checkout_time');
  });

  await step('Re-check-in after checkout returns expected 409', async () => {
    const { response, json } = await post(
      '/attendance/check-in',
      {
        qr_token: qrToken,
      },
      workerTokens.accessToken,
    );

    expectStatus(response, json, 409);
    expectErrorCode(json, 'ATTENDANCE_ALREADY_COMPLETED');
  });

  await step('Worker/company/admin attendance list visibility checks', async () => {
    const workerList = await get('/attendance', workerTokens.accessToken);
    expectStatus(workerList.response, workerList.json, 200);
    const workerAttendance = listData(workerList.json, 'worker attendance list');
    expectAtLeast(workerAttendance.filter((item) => item.id === attendanceId).length, 1, 'worker visible attendance records');

    const companyList = await get('/attendance', companyTokens.accessToken);
    expectStatus(companyList.response, companyList.json, 200);
    const companyAttendance = listData(companyList.json, 'company attendance list');
    expectAtLeast(companyAttendance.filter((item) => item.id === attendanceId).length, 1, 'company visible attendance records');

    const adminList = await get('/attendance', adminTokens.accessToken);
    expectStatus(adminList.response, adminList.json, 200);
    const adminAttendance = listData(adminList.json, 'admin attendance list');
    expectAtLeast(adminAttendance.filter((item) => item.id === attendanceId).length, 1, 'admin visible attendance records');
  });

  await step('Worker updates profile fields', async () => {
    const { response, json } = await patch(
      '/workers/me',
      {
        skills: ['Servis', 'Banket xidməti', 'Qonaq qarşılama'],
        languages: ['Azərbaycan', 'English', 'Türkçe'],
        work_history_summary: 'Hilton Baku banket xidməti',
        work_history: [
          {
            company_name: 'Marriott Boulevard',
            position: 'Ofisiant',
            note: 'Banket və VIP qonaq xidməti',
          },
        ],
        availability: true,
      },
      workerTokens.accessToken,
    );

    expectStatus(response, json, 200);
    const worker = expectObject(unwrapData(json), 'updated worker profile');
    expectContains(worker, 'Hilton Baku banket xidməti', 'updated profile response');
  });

  await step('Worker uploads profile photo and health certificate', async () => {
    const photo = await requestMultipart('/workers/me/profile-photo', makeProfileImageForm(), workerTokens.accessToken);
    expectStatus(photo.response, photo.json, 201);
    const photoPayload = expectObject(unwrapData(photo.json), 'profile photo upload response');
    expectString(photoPayload.profile_photo_url ?? photoPayload.url, 'profile photo URL');

    const document = await requestMultipart(
      '/workers/me/documents',
      makeDocumentForm('health_certificate'),
      workerTokens.accessToken,
    );
    expectStatus(document.response, document.json, 201);
    const documentPayload = expectObject(unwrapData(document.json), 'document upload response');
    expectContains(documentPayload, 'health_certificate', 'document upload response');
  });

  await step('Admin can view full worker profile', async () => {
    const { response, json } = await get(`/admin/workers/${workerId}`, adminTokens.accessToken);
    expectStatus(response, json, 200);
    const worker = expectObject(unwrapData(json), 'admin worker profile');
    expectEqual(worker.id, workerId, 'admin worker profile id');
    expectEqual(worker.phone, workerPhone, 'admin worker phone');
    expectContains(worker, 'health_certificate', 'admin worker documents');
  });

  await step('Company-safe worker profile does not expose phone/email', async () => {
    const { response, json } = await get(`/workers/${workerId}/company-profile`, companyTokens.accessToken);
    expectStatus(response, json, 200);
    const profile = expectObject(unwrapData(json), 'company-safe worker profile');
    expectEqual(profile.id, workerId, 'company-safe worker id');
    expectNoKey(profile, 'phone', 'company-safe worker profile');
    expectNoKey(profile, 'email', 'company-safe worker profile');
  });

  await step('Worker changes phone with OTP verification', async () => {
    const newPhone = createPhone(4);

    const request = await post(
      '/auth/worker/phone-change/request',
      { phone: newPhone },
      workerTokens.accessToken,
    );
    expectStatus(request.response, request.json, 200);

    const confirm = await post(
      '/auth/worker/phone-change/confirm',
      {
        phone: newPhone,
        otp_code: TEST_OTP,
      },
      workerTokens.accessToken,
    );
    expectStatus(confirm.response, confirm.json, 200);

    const me = await get('/workers/me', workerTokens.accessToken);
    expectStatus(me.response, me.json, 200);
    const worker = expectObject(unwrapData(me.json), 'worker profile after phone change');
    expectEqual(worker.phone, newPhone, 'changed worker phone');
  });

  await step('Company rates worker after checkout', async () => {
    const { response, json } = await post(
      '/ratings',
      {
        assignment_id: assignmentId,
        score: 5,
        feedback: 'Peşəkar servis və vaxtında checkout',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const rating = expectObject(unwrapData(json), 'created rating');
    ratingId = expectString(rating.id, 'rating id');
    expectEqual(rating.assignment_id, assignmentId, 'rating assignment id');
  });

  await step('Duplicate rating returns expected 409', async () => {
    const { response, json } = await post(
      '/ratings',
      {
        assignment_id: assignmentId,
        score: 4,
        feedback: 'Təkrar reytinq yoxlaması',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 409);
    expectErrorCode(json, 'DUPLICATE_RATING');
  });

  await step('Worker rating history includes rating', async () => {
    const { response, json } = await get('/ratings/me', workerTokens.accessToken);
    expectStatus(response, json, 200);
    const ratings = listData(json, 'worker rating history');
    expectAtLeast(ratings.filter((item) => item.id === ratingId).length, 1, 'worker rating history matches');
  });

  await step('Admin worker rating history includes rating', async () => {
    const { response, json } = await get(`/workers/${workerId}/ratings`, adminTokens.accessToken);
    expectStatus(response, json, 200);
    const ratings = listData(json, 'admin worker rating history');
    expectAtLeast(ratings.filter((item) => item.id === ratingId).length, 1, 'admin rating history matches');
  });

  await step('Create and approve extra worker for category capacity check', async () => {
    const existingWorkerId = await findExistingApprovedWorker(adminTokens.accessToken, [workerId], waiterPosition.id);

    if (existingWorkerId) {
      capacityWorkerId = existingWorkerId;
      process.stdout.write('(using existing approved worker) ');
      return;
    }

    capacityWorkerId = await registerVerifyApproveWorker(
      capacityWorkerPhone,
      capacityWorkerName,
      adminTokens.accessToken,
      waiterPosition.id,
    );
  });

  await step('Duplicate category in multi-category order returns validation error', async () => {
    const dates = futureWindow(48, 8);
    const { response, json } = await post(
      '/orders',
      {
        title: 'Crescent Hotel Group kateqoriya yoxlaması',
        description: 'Təkrar kateqoriya validasiyası üçün real hotel sifarişi.',
        category: waiterPosition.name_az,
        required_count: 2,
        category_items: [
          orderItemFor(waiterPosition, 1),
          orderItemFor(waiterPosition, 1),
        ],
        start_datetime: dates.start_date,
        end_datetime: dates.end_date,
        location: 'Crescent Hotel Group, Bakı',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 400);
    expectErrorCode(json, 'VALIDATION_ERROR');
    expectContains(json, 'category_items', 'duplicate category error');
  });

  await step('Company creates multi-category order', async () => {
    const dates = futureWindow(72, 8);
    const { response, json } = await post(
      '/orders',
      {
        title: 'Four Seasons Baku çoxkateqoriyalı növbə',
        description: 'Four Seasons Baku üçün banket, bar və zal əməliyyat dəstəyi.',
        category: waiterPosition.name_az,
        required_count: 2,
        category_items: [
          orderItemFor(waiterPosition, 1, 'VIP mertebe'),
          orderItemFor(bartenderPosition, 1, 'Lobby bar'),
        ],
        start_datetime: dates.start_date,
        end_datetime: dates.end_date,
        location: 'Four Seasons Baku, Bakı',
      },
      companyTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const order = expectObject(unwrapData(json), 'multi-category order');
    multiOrderId = expectString(order.id, 'multi-category order id');
    const categoryItems = expectArray(order.category_items, 'multi-category order.category_items');
    expectEqual(categoryItems.length, 2, 'multi-category item count');
    expectEqual(order.required_count, 2, 'multi-category required_count sum');
    firstCategoryItemId = expectString(categoryItems[0].id, 'first category item id');
    firstCategoryName = expectString(categoryItems[0].category, 'first category name');
    expectEqual(categoryItems[0].position_id, waiterPosition.id, 'first category item position id');
    expectEqual(categoryItems[1].position_id, bartenderPosition.id, 'second category item position id');
  });

  await step('Super admin assigns worker to selected category item', async () => {
    const { response, json } = await post(
      '/assignments',
      {
        order_id: multiOrderId,
        assignments: [
          {
            worker_id: workerId,
            order_category_item_id: firstCategoryItemId,
          },
        ],
      },
      adminTokens.accessToken,
    );

    expectStatus(response, json, 201);
    const assignments = listData(json, 'category-aware assignment response');
    const assignment = expectObject(assignments[0], 'category-aware assignment');
    multiAssignmentId = expectString(assignment.id, 'category-aware assignment id');
    const itemCategory = assignment.order_category_item?.category ?? assignment.category;
    expectEqual(itemCategory, firstCategoryName, 'assigned category');
    expectEqual(assignment.position_id, waiterPosition.id, 'assigned position id');
  });

  await step('Category-aware capacity rejects over-assignment', async () => {
    const { response, json } = await post(
      '/assignments',
      {
        order_id: multiOrderId,
        assignments: [
          {
            worker_id: capacityWorkerId,
            order_category_item_id: firstCategoryItemId,
          },
        ],
      },
      adminTokens.accessToken,
    );

    expectStatus(response, json, 409);
    expectErrorCode(json, 'ORDER_CAPACITY_EXCEEDED');
  });

  await step('Worker assignment detail shows assigned category', async () => {
    const { response, json } = await get(`/assignments/${multiAssignmentId}`, workerTokens.accessToken);
    expectStatus(response, json, 200);
    const assignment = expectObject(unwrapData(json), 'worker assignment detail');
    const itemCategory = assignment.order_category_item?.category ?? assignment.category;
    expectEqual(itemCategory, firstCategoryName, 'worker assignment detail category');
  });

  await step('Admin reports summary works', async () => {
    const { response, json } = await get('/admin/reports/summary', adminTokens.accessToken);
    expectStatus(response, json, 200);
    const report = expectObject(unwrapData(json), 'admin report summary');
    expectObject(report.dashboard, 'report.dashboard');
    expectObject(report.reports, 'report.reports');
  });

  await step('Admin report date filters include selected end date', async () => {
    const today = dateOnlyUtc();
    const { response, json } = await get(
      `/admin/reports/summary${query({
        start_date: today,
        end_date: today,
        company_id: companyId,
        position_id: waiterPosition.id,
      })}`,
      adminTokens.accessToken,
    );

    expectStatus(response, json, 200);
    const report = expectObject(unwrapData(json), 'filtered admin report summary');
    const usage = expectArray(report.reports?.company_usage, 'filtered company usage');
    const positionDemand = expectArray(report.reports?.position_demand, 'filtered position demand');
    expectAtLeast(positionDemand.length, 1, 'filtered position demand count');
    const matchingCompany = usage.find((item) => item.company_id === companyId);
    expectObject(matchingCompany, 'filtered company usage row');
    expectAtLeast(expectNumber(matchingCompany.order_count, 'filtered company order_count'), 1, 'filtered company order count');
  });

  await step('In-app notifications exist for worker and admin', async () => {
    const workerNotifications = await get('/notifications', workerTokens.accessToken);
    expectStatus(workerNotifications.response, workerNotifications.json, 200);
    expectAtLeast(listData(workerNotifications.json, 'worker notifications').length, 1, 'worker notification count');

    const adminNotifications = await get('/notifications', adminTokens.accessToken);
    expectStatus(adminNotifications.response, adminNotifications.json, 200);
    expectAtLeast(listData(adminNotifications.json, 'admin notifications').length, 1, 'admin notification count');
  });

  await step('FCM token register/delete endpoints work without delivery', async () => {
    const deviceToken = `set-service-fcm-token-${RUN_ID}`;
    const deviceId = `set-service-installation-${RUN_ID}`;
    const register = await post(
      '/auth/fcm-token',
      {
        fcm_token: deviceToken,
        platform: 'android',
        device_id: deviceId,
      },
      workerTokens.accessToken,
    );

    expectStatus(register.response, register.json, 201);
    const payload = expectObject(unwrapData(register.json), 'FCM register response');
    expectEqual(payload.registered, true, 'FCM registered flag');
    expectEqual(payload.app_role, 'worker', 'FCM app role');

    const remove = await del('/auth/fcm-token', { fcm_token: deviceToken }, workerTokens.accessToken);
    expectStatus(remove.response, remove.json, 204);
  });

  await step('Company deactivates venue kiosk and public QR stops', async () => {
    const deactivate = await del(
      `/attendance/venue-kiosks/${venueKioskId}/active-session`,
      undefined,
      companyTokens.accessToken,
    );
    expectStatus(deactivate.response, deactivate.json, 200);

    const qrAfterDeactivate = await postWithKioskCapability(
      '/attendance/venue-kiosks/qr-token',
      venueKioskToken,
    );
    expectStatus(qrAfterDeactivate.response, qrAfterDeactivate.json, 409);
    expectErrorCode(qrAfterDeactivate.json, 'KIOSK_WAITING_FOR_ACTIVE_ORDER');
  });

  await step('Parallel invalid OTP attempts atomically block further verification', async () => {
    const registration = await postAuthFlow('/auth/worker/register', {
      full_name: `OTP Atomicity ${RUN_ID}`,
      phone: bruteForceWorkerPhone,
      position: 'Ofisiant',
      position_ids: [waiterPosition.id],
      skills: ['Servis'],
      languages: ['Azərbaycan'],
    });
    expectStatus(registration.response, registration.json, 201);

    const wrongOtp = TEST_OTP === '000000' ? '999999' : '000000';
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => post('/auth/verify-otp', {
        phone: bruteForceWorkerPhone,
        otp_code: wrongOtp,
        purpose: 'worker_registration',
      })),
    );
    for (const attempt of attempts) {
      expectStatus(attempt.response, attempt.json, [401, 429]);
    }

    const correctAfterBlock = await post('/auth/verify-otp', {
      phone: bruteForceWorkerPhone,
      otp_code: TEST_OTP,
      purpose: 'worker_registration',
    });
    expectStatus(correctAfterBlock.response, correctAfterBlock.json, 429);
    expectErrorCode(correctAfterBlock.json, 'OTP_BLOCKED');
  });

  if (failures > 0) {
    console.error(`\nVerification flow finished with ${failures} failure(s).`);
    process.exit(1);
  }

  console.log('\nFull-system verification flow passed.');
  console.log('Covered: auth, approval, orders, multi-category capacity, assignments, attendance/order-based QR, persistent venue kiosk flow, profile/upload, ratings, reports, notifications, FCM token lifecycle.');
}

main().catch((error) => {
  console.error('\nUnexpected verification flow failure.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
