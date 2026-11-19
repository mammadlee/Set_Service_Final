import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateOrLocalHostname,
  validateProductionUrl,
  validateReleaseEnvironment,
  validateWorkerBuildEnvironment,
} from './validate-web-env.mjs';

test('all web targets require their production variables', () => {
  assert.throws(() => validateReleaseEnvironment('admin', {}), /VITE_API_BASE_URL is required/);
  assert.throws(
    () => validateReleaseEnvironment('admin', { VITE_API_BASE_URL: 'https://api.setservice.az' }),
    /VITE_KIOSK_BASE_URL is required/,
  );
  assert.throws(() => validateReleaseEnvironment('company', {}), /VITE_API_BASE_URL is required/);
  assert.throws(() => validateReleaseEnvironment('kiosk', {}), /VITE_API_BASE_URL is required/);
});

test('worker CI builds are pinned to an explicit non-routable endpoint', () => {
  assert.deepEqual(
    validateWorkerBuildEnvironment('ci', {
      APP_ENV: 'ci',
      BASE_URL: 'https://api.invalid/',
    }),
    { APP_ENV: 'ci', BASE_URL: 'https://api.invalid' },
  );
  assert.throws(
    () => validateWorkerBuildEnvironment('ci', { APP_ENV: 'ci', BASE_URL: 'https://api.setservice.az' }),
    /must be exactly https:\/\/api\.invalid/,
  );
  assert.throws(
    () => validateWorkerBuildEnvironment('ci', { APP_ENV: 'staging', BASE_URL: 'https://api.invalid' }),
    /APP_ENV must be exactly ci/,
  );
});

test('worker production builds accept only the approved production API', () => {
  for (const baseUrl of [
    'https://api.setservice.az',
    'https://api.setservice.az/',
    'https://api.setservice.az/v1',
    'https://api.setservice.az/v1/',
  ]) {
    const validated = validateWorkerBuildEnvironment('production', {
      APP_ENV: 'production',
      BASE_URL: baseUrl,
    });
    assert.match(validated.BASE_URL, /^https:\/\/api\.setservice\.az(?:\/v1)?$/);
  }

  for (const baseUrl of [
    'https://staging-api.setservice.az',
    'https://api.setservice.az/v2',
    'https://api.setservice.az:8443/v1',
  ]) {
    assert.throws(
      () => validateWorkerBuildEnvironment('production', {
        APP_ENV: 'production',
        BASE_URL: baseUrl,
      }),
      /approved SET Service production API/,
    );
  }
});

test('worker staging builds reject the production API and missing configuration', () => {
  assert.deepEqual(
    validateWorkerBuildEnvironment('staging', {
      APP_ENV: 'staging',
      BASE_URL: 'https://staging-api.setservice.az/v1/',
    }),
    { APP_ENV: 'staging', BASE_URL: 'https://staging-api.setservice.az/v1' },
  );
  for (const baseUrl of [
    'https://api.setservice.az/v1',
    'https://api.setservice.az/staging',
    'https://api.setservice.az:8443/v1',
  ]) {
    assert.throws(
      () => validateWorkerBuildEnvironment('staging', {
        APP_ENV: 'staging',
        BASE_URL: baseUrl,
      }),
      /must not use the production API hostname/,
    );
  }
  assert.throws(
    () => validateWorkerBuildEnvironment('staging', { APP_ENV: 'staging' }),
    /BASE_URL is required/,
  );
  assert.throws(
    () => validateWorkerBuildEnvironment('production', { BASE_URL: 'https://api.setservice.az' }),
    /APP_ENV must be exactly production/,
  );
});

test('production URLs must use HTTPS and contain no credentials or URL metadata', () => {
  assert.throws(
    () => validateProductionUrl('http://api.example.test', 'VITE_API_BASE_URL'),
    /must use HTTPS/,
  );
  assert.throws(
    () => validateProductionUrl('https://user:secret@api.example.test', 'VITE_API_BASE_URL'),
    /embedded credentials/,
  );
  assert.throws(
    () => validateProductionUrl('https://api.example.test/path?token=secret', 'VITE_API_BASE_URL'),
    /query string or fragment/,
  );
});

test('localhost and private network endpoints are rejected', () => {
  for (const hostname of [
    'localhost',
    'api.localhost',
    'service.local',
    'api',
    'api.internal',
    'api.internal.',
    'metadata.google.internal',
    'router.home.arpa',
    'service.lan',
    'service.corp',
    'service.intranet',
    'api.example.test',
    'api.example.com',
    '127.0.0.1',
    '10.0.0.2',
    '172.16.0.2',
    '192.168.1.5',
    '169.254.10.2',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd12::1',
    'ff02::1',
    '2001:db8::1',
  ]) {
    assert.equal(isPrivateOrLocalHostname(hostname), true, hostname);
  }

  assert.throws(
    () => validateProductionUrl('https://192.168.1.5/v1', 'VITE_API_BASE_URL'),
    /public production hostname/,
  );
  assert.throws(
    () => validateProductionUrl('https://api/v1', 'VITE_API_BASE_URL'),
    /public production hostname/,
  );
  assert.throws(
    () => validateProductionUrl('https://metadata.google.internal/v1', 'VITE_API_BASE_URL'),
    /public production hostname/,
  );
  assert.throws(
    () => validateProductionUrl('https://203.0.113.1/v1', 'VITE_API_BASE_URL'),
    /public production hostname/,
  );
  for (const encodedLoopback of [
    'https://0x7f000001/v1',
    'https://017700000001/v1',
    'https://2130706433/v1',
    'https://127.1/v1',
  ]) {
    assert.throws(
      () => validateProductionUrl(encodedLoopback, 'VITE_API_BASE_URL'),
      /public production hostname/,
      encodedLoopback,
    );
  }
});

test('valid public HTTPS endpoints are accepted for every target', () => {
  const admin = validateReleaseEnvironment('admin', {
    VITE_API_BASE_URL: 'https://api.setservice.az/',
    VITE_KIOSK_BASE_URL: 'https://qr.setservice.az/',
  });
  const company = validateReleaseEnvironment('company', {
    VITE_API_BASE_URL: 'https://api.setservice.az/v1',
  });
  const kiosk = validateReleaseEnvironment('kiosk', {
    VITE_API_BASE_URL: 'https://api.setservice.az/v1',
  });

  assert.equal(admin.VITE_API_BASE_URL, 'https://api.setservice.az');
  assert.equal(admin.VITE_KIOSK_BASE_URL, 'https://qr.setservice.az');
  assert.equal(company.VITE_API_BASE_URL, 'https://api.setservice.az/v1');
  assert.equal(kiosk.VITE_API_BASE_URL, 'https://api.setservice.az/v1');
});
