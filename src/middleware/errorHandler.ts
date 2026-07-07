import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'Upload file is too large.' : 'Upload failed.',
      code: err.code === 'LIMIT_FILE_SIZE' ? 'UPLOAD_FILE_TOO_LARGE' : 'UPLOAD_FAILED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  Sentry.captureException(err);
  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  });
}
