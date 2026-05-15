export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (msg: string, code = 'BAD_REQUEST', details?: unknown) => new AppError(400, code, msg, details),
  unauthorized: (msg = 'Authentication is required', code = 'UNAUTHORIZED', details?: unknown) =>
    new AppError(401, code, msg, details),
  forbidden: (msg = 'Access is forbidden', code = 'FORBIDDEN', details?: unknown) =>
    new AppError(403, code, msg, details),
  notFound: (msg = 'Not found', code = 'NOT_FOUND', details?: unknown) =>
    new AppError(404, code, msg, details),
  conflict: (msg: string, code = 'CONFLICT', details?: unknown) => new AppError(409, code, msg, details),
  gone: (msg: string, code = 'GONE', details?: unknown) => new AppError(410, code, msg, details),
  tooMany: (msg = 'Too many requests', code = 'TOO_MANY_REQUESTS', details?: unknown) =>
    new AppError(429, code, msg, details),
  internal: (msg = 'Internal server error', code = 'INTERNAL_ERROR', details?: unknown) =>
    new AppError(500, code, msg, details),
};
