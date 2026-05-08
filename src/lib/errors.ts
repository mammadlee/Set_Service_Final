export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (msg: string, code = 'BAD_REQUEST') => new AppError(400, code, msg),
  unauthorized: (msg = 'Giriş tələb olunur') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'Giriş qadağandır') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Tapılmadı') => new AppError(404, 'NOT_FOUND', msg),
  conflict: (msg: string) => new AppError(409, 'CONFLICT', msg),
  gone: (msg: string) => new AppError(410, 'GONE', msg),
  tooMany: (msg = 'Çox sayda sorğu') => new AppError(429, 'TOO_MANY_REQUESTS', msg),
  internal: (msg = 'Server xətası') => new AppError(500, 'INTERNAL_ERROR', msg),
};
