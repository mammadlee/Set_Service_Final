import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Build output directory is required.');
const policy = await readFile(path.resolve(outputDirectory, '_headers'), 'utf8');
for (const expected of [
  "Content-Security-Policy: default-src 'self'",
  "frame-ancestors 'none'",
  'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy: no-referrer',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
]) {
  assert.ok(policy.includes(expected), `Missing built security header policy: ${expected}`);
}
console.log('built security headers: OK');
