import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { Errors } from '../../lib/errors';
import { getTokenExpiration } from '../../lib/jwt';

export type WebSessionRole = 'admin' | 'company';

const COOKIE_NAMES: Record<WebSessionRole, string> = {
  admin: 'setservice_admin_refresh',
  company: 'setservice_company_refresh',
};

export function requireTrustedWebOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const origin = req.get('origin');
  const allowedOrigins = configuredOrigins();

  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      return next(Errors.forbidden('A trusted browser origin is required.', 'WEB_ORIGIN_REQUIRED'));
    }
    return next();
  }

  if (
    allowedOrigins.includes(origin)
    || (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0)
  ) {
    return next();
  }

  next(Errors.forbidden('Origin is not allowed for browser authentication.', 'WEB_ORIGIN_DENIED'));
}

export function setWebRefreshCookie(
  res: Response,
  role: WebSessionRole,
  refreshToken: string,
): void {
  const maxAge = Math.max(0, getTokenExpiration(refreshToken).getTime() - Date.now());
  res.cookie(COOKIE_NAMES[role], refreshToken, {
    ...cookieOptions(role),
    maxAge,
  });
  setPrivateAuthResponseHeaders(res);
}

export function clearWebRefreshCookie(res: Response, role: WebSessionRole): void {
  res.clearCookie(COOKIE_NAMES[role], cookieOptions(role));
  setPrivateAuthResponseHeaders(res);
}

export function readWebRefreshCookie(req: Request, role: WebSessionRole): string {
  const token = parseCookies(req.get('cookie'))[COOKIE_NAMES[role]];
  if (!token) {
    throw Errors.unauthorized('Browser session is missing or expired.', 'WEB_SESSION_REQUIRED');
  }
  return token;
}

export function webTokenResponse<T extends {
  access_token: string;
  user: unknown;
}>(tokens: T): Pick<T, 'access_token' | 'user'> {
  return {
    access_token: tokens.access_token,
    user: tokens.user,
  };
}

export function setPrivateAuthResponseHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function cookieOptions(role: WebSessionRole): CookieOptions {
  const sameSite = readSameSite();
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: `/v1/auth/${role}`,
  };
}

function readSameSite(): 'lax' | 'strict' | 'none' {
  const configured = (process.env.AUTH_COOKIE_SAME_SITE ?? 'lax').trim().toLowerCase();
  if (configured === 'lax' || configured === 'strict' || configured === 'none') {
    return configured;
  }
  throw new Error('AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none');
}

function configuredOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return cookies;

    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
    return cookies;
  }, {});
}
