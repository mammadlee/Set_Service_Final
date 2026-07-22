import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { SmsProviderException } from '../lib/sms';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      request_id: res.getHeader('x-request-id'),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (err instanceof SmsProviderException) {
    res.status(503).json({
      error: 'OTP göndərilə bilmədi',
      code: 'SMS_PROVIDER_UNAVAILABLE',
      request_id: res.getHeader('x-request-id'),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      request_id: res.getHeader('x-request-id'),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const fileTooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(fileTooLarge ? 413 : 400).json({
      error: fileTooLarge ? 'Upload file is too large.' : 'Upload failed.',
      code: fileTooLarge ? 'UPLOAD_FILE_TOO_LARGE' : 'UPLOAD_FAILED',
      request_id: res.getHeader('x-request-id'),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('request_id', String(res.getHeader('x-request-id') ?? 'unknown'));
    scope.setTag('route', req.route?.path ?? req.path);
    if (req.user) {
      scope.setUser({ id: req.user.sub });
      scope.setTag('role', req.user.role);
    }
    Sentry.captureException(err);
  });
  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    error_code: 'INTERNAL_ERROR',
    route: req.route?.path ?? req.path,
  });

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    request_id: res.getHeader('x-request-id'),
    timestamp: new Date().toISOString(),
  });
}
