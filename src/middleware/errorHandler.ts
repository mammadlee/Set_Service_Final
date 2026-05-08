import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { AppError } from '../lib/errors';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation xətası
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation xətası',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  // Bizim AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Gözlənilməz xəta — Sentry-ə göndər
  Sentry.captureException(err);
  console.error('[Unhandled Error]', err);

  res.status(500).json({ error: 'Server xətası', code: 'INTERNAL_ERROR' });
}
