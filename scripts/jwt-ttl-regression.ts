import assert from 'node:assert/strict';
import { JWT_TTL_SPECS, jwtTtlIssue, parseJwtTtlSeconds, readJwtTtl } from '../src/lib/jwt-ttl';

function main(): void {
  assert.equal(parseJwtTtlSeconds('15m'), 900);
  assert.equal(parseJwtTtlSeconds('30d'), 2_592_000);
  assert.equal(parseJwtTtlSeconds('120'), null, 'unitless strings are ambiguous in jsonwebtoken');
  assert.equal(parseJwtTtlSeconds('1 month'), null);
  assert.equal(jwtTtlIssue('JWT_ACCESS_EXPIRES_IN', '1m'), null);
  assert.match(jwtTtlIssue('JWT_ACCESS_EXPIRES_IN', '2h') ?? '', /between/);
  assert.equal(jwtTtlIssue('JWT_REFRESH_EXPIRES_IN', '90d'), null);
  assert.match(jwtTtlIssue('JWT_REFRESH_EXPIRES_IN', '91d') ?? '', /between/);
  assert.equal(jwtTtlIssue('JWT_REGISTRATION_EXPIRES_IN', '30m'), null);
  assert.match(jwtTtlIssue('JWT_REGISTRATION_EXPIRES_IN', '2h') ?? '', /between/);
  assert.equal(readJwtTtl('JWT_ACCESS_EXPIRES_IN', {}), JWT_TTL_SPECS.JWT_ACCESS_EXPIRES_IN.defaultValue);
  assert.throws(
    () => readJwtTtl('JWT_REGISTRATION_EXPIRES_IN', { JWT_REGISTRATION_EXPIRES_IN: '0m' }),
    /positive integer/,
  );
  console.log('jwt-ttl-regression: OK');
}

main();
