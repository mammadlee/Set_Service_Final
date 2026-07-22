import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { readJwtTtl } from './jwt-ttl';

const ACCESS_EXPIRES = readJwtTtl('JWT_ACCESS_EXPIRES_IN');
const REFRESH_EXPIRES = readJwtTtl('JWT_REFRESH_EXPIRES_IN');
const REGISTRATION_EXPIRES = readJwtTtl('JWT_REGISTRATION_EXPIRES_IN');
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'set-service-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'set-service-clients';
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export type TokenUse = 'access' | 'refresh' | 'registration';

export interface JwtPayload {
  sub: string;       // user.id
  role: string;
  token_use: TokenUse;
  jti: string;
  session_version: number;
  family_id?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

type TokenIdentity = Pick<JwtPayload, 'sub' | 'role'> & {
  session_version?: number;
  jti?: string;
  family_id?: string;
};

function accessSecret(): string {
  return requiredSecret('JWT_ACCESS_SECRET');
}

function refreshSecret(): string {
  return requiredSecret('JWT_REFRESH_SECRET');
}

function requiredSecret(key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const secret = process.env[key];
  if (!secret) {
    throw new Error(`${key} is required`);
  }
  return secret;
}

function signToken(payload: TokenIdentity, tokenUse: TokenUse): string {
  const secret = tokenUse === 'refresh' ? refreshSecret() : accessSecret();
  const expiresIn = tokenUse === 'access'
    ? ACCESS_EXPIRES
    : tokenUse === 'registration'
      ? REGISTRATION_EXPIRES
      : REFRESH_EXPIRES;
  const jti = payload.jti ?? randomUUID();
  const sessionVersion = payload.session_version ?? 0;
  const familyId = tokenUse === 'refresh' ? (payload.family_id ?? randomUUID()) : undefined;

  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      token_use: tokenUse,
      jti,
      session_version: sessionVersion,
      ...(familyId ? { family_id: familyId } : {}),
    },
    secret,
    {
      algorithm: JWT_ALGORITHM,
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
      expiresIn,
    } as jwt.SignOptions
  );
}

function verifyTokenForUse(token: string, expectedUse: TokenUse): JwtPayload {
  const secret = expectedUse === 'refresh' ? refreshSecret() : accessSecret();
  const decoded = jwt.verify(token, secret, {
    algorithms: [JWT_ALGORITHM],
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
  });

  if (
    typeof decoded === 'string'
    || typeof decoded.sub !== 'string'
    || typeof decoded.role !== 'string'
    || typeof decoded.jti !== 'string'
    || decoded.jti.length < 8
    || !Number.isInteger(decoded.session_version)
    || decoded.session_version < 0
    || decoded.token_use !== expectedUse
    || (expectedUse === 'refresh' && (typeof decoded.family_id !== 'string' || decoded.family_id.length < 8))
  ) {
    throw new jwt.JsonWebTokenError(`Expected a ${expectedUse} token`);
  }

  return decoded as JwtPayload;
}

export function signAccessToken(payload: TokenIdentity): string {
  return signToken(payload, 'access');
}

export function signRefreshToken(payload: TokenIdentity): string {
  return signToken(payload, 'refresh');
}

export function signRegistrationToken(payload: TokenIdentity): string {
  return signToken(payload, 'registration');
}

export function verifyAccessToken(token: string): JwtPayload {
  return verifyTokenForUse(token, 'access');
}

export function verifyRefreshToken(token: string): JwtPayload {
  return verifyTokenForUse(token, 'refresh');
}

export function verifyRegistrationToken(token: string): JwtPayload {
  return verifyTokenForUse(token, 'registration');
}

export function getTokenExpiration(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) {
    throw new jwt.JsonWebTokenError('Token expiration is missing');
  }
  return new Date(decoded.exp * 1000);
}
