type Json = Record<string, unknown>;

const baseUrl = process.env.HIREAPP_BASE_URL ?? 'http://localhost:3000/v1';
const otpCode = process.env.OTP_TEST_CODE ?? '123456';
const adminPhone = process.env.SEED_ADMIN_PHONE ?? '+994700000001';
const workerPhone = `+99455${(Date.now() % 10_000_000).toString().padStart(7, '0')}`;

async function main() {
  console.log(`Running MVP smoke flow against ${baseUrl}`);

  const register = await post('/auth/worker/register', {
    full_name: 'Smoke Test Worker',
    phone: workerPhone,
    position: 'Event Staff',
    skills: ['events', 'setup'],
    languages: ['az', 'en'],
    documents: [],
  });
  assert(register.status === 201, 'worker registration should return 201', register.body);
  const workerId = String(register.body.worker_id);

  const verified = await post('/auth/verify-otp', {
    phone: workerPhone,
    otp_code: otpCode,
    purpose: 'worker_registration',
  });
  assert(verified.body.status === 'pending_approval', 'registration OTP should move to pending approval', verified.body);

  const blockedLogin = await post('/auth/worker/login', { phone: workerPhone });
  assert(blockedLogin.status === 403, 'pending worker login should be blocked', blockedLogin.body);

  await post('/auth/admin/login', { phone: adminPhone });
  const adminTokens = await post('/auth/verify-otp', {
    phone: adminPhone,
    otp_code: otpCode,
    purpose: 'admin_login',
  });
  const adminToken = String(adminTokens.body.access_token ?? '');
  assert(Boolean(adminToken), 'admin login should return access token', adminTokens.body);

  const approved = await patch(`/admin/workers/${workerId}/approve`, {}, adminToken);
  assert(approved.body.status === 'approved', 'admin should approve worker', approved.body);

  await post('/auth/worker/login', { phone: workerPhone });
  const workerTokens = await post('/auth/verify-otp', {
    phone: workerPhone,
    otp_code: otpCode,
    purpose: 'worker_login',
  });
  const workerToken = String(workerTokens.body.access_token ?? '');
  assert(Boolean(workerToken), 'approved worker login should return access token', workerTokens.body);

  const denied = await get('/admin/workers', workerToken);
  assert(denied.status === 403, 'worker token should be denied from admin routes', denied.body);

  console.log('MVP smoke flow passed.');
}

async function post(path: string, body: Json, token?: string) {
  return request('POST', path, body, token);
}

async function patch(path: string, body: Json, token?: string) {
  return request('PATCH', path, body, token);
}

async function get(path: string, token?: string) {
  return request('GET', path, undefined, token);
}

async function request(method: string, path: string, body?: Json, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Json : {} };
}

function assert(condition: unknown, message: string, context: unknown): asserts condition {
  if (!condition) {
    console.error(context);
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
