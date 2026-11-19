import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { runWithRequestContext } from '../lib/request-context';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = safeHeaderId(req.header('x-request-id')) ?? randomUUID();
  const correlationId = safeHeaderId(req.header('x-correlation-id')) ?? requestId;
  const startedAt = process.hrtime.bigint();

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  runWithRequestContext({
    request_id: requestId,
    correlation_id: correlationId,
    release_sha: process.env.RELEASE_SHA ?? process.env.GIT_SHA ?? undefined,
  }, () => {
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('http_request', {
        method: req.method,
        route: routeTemplate(req),
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        content_length: res.getHeader('content-length') ?? null,
      });
    });
    next();
  });
}

export function configureTrustProxy(app: { set(name: string, value: unknown): unknown }): void {
  const trustedCidrs = (process.env.TRUST_PROXY_CIDRS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (trustedCidrs.length > 0) {
    app.set('trust proxy', trustedCidrs);
  } else {
    // The secure default ignores X-Forwarded-For from untrusted direct clients.
    app.set('trust proxy', false);
  }
}

export function safeHeaderId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && SAFE_REQUEST_ID.test(normalized) ? normalized : undefined;
}

export function routeTemplate(req: Request): string {
  const routePath = typeof req.route?.path === 'string' ? req.route.path : undefined;
  if (routePath) return `${req.baseUrl ?? ''}${routePath}` || '/';

  return (req.path || '/')
    .replace(
      /(\/(?:kiosk-sessions|venue-kiosks|kiosk|qr-kiosk)\/)[^/]+/gi,
      '$1:token'
    );
}
