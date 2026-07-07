import './instrument';
import express from 'express';
import type { Request as ExpressRequest } from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import * as Sentry from '@sentry/node';

import { errorHandler } from './middleware/errorHandler';
import authRouter from './modules/auth/auth.router';
import companiesRouter from './modules/companies/companies.router';
import workersRouter from './modules/workers/workers.router';
import ordersRouter from './modules/orders/orders.router';
import assignmentsRouter from './modules/assignments/assignments.router';
import attendanceRouter from './modules/attendance/attendance.router';
import ratingsRouter from './modules/ratings/ratings.router';
import reportsRouter, { companyReportsRouter } from './modules/reports/reports.router';
import notificationsRouter from './modules/notifications/notifications.router';
import adminsRouter from './modules/admins/admins.router';
import taxonomyRouter from './modules/taxonomy/taxonomy.router';
import { logger } from './lib/logger';
import { Errors } from './lib/errors';
import { assignCompatibilityRouter } from './modules/assignments/assignments.router';

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) app.set('trust proxy', 1);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    const allowedOrigins = parseCorsOrigins();
    if (!origin) return callback(null, true);
    if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Errors.forbidden('Origin is not allowed by CORS.', 'CORS_ORIGIN_DENIED'));
  },
  credentials: false,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
if (!isProduction && (process.env.STORAGE_PROVIDER ?? 'local') === 'local') {
  app.use('/uploads', express.static(path.resolve(process.env.LOCAL_UPLOAD_DIR ?? 'uploads')));
}
morgan.token('safe-url', (req) => {
  const request = req as ExpressRequest;
  return redactSensitiveUrl(request.originalUrl ?? request.url ?? '');
});
const httpLogFormat = isProduction
  ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : ':method :safe-url :status :response-time ms - :res[content-length]';

app.use(morgan(httpLogFormat, {
  stream: {
    write: (message) => logger.info('http_request', { message: message.trim() }),
  },
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.', code: 'TOO_MANY_REQUESTS' },
});

app.use(globalLimiter);
app.use('/v1/auth/register', authLimiter);
app.use('/v1/auth/worker/register', authLimiter);
app.use('/v1/auth/worker/request-otp', authLimiter);
app.use('/v1/auth/worker/complete-registration', authLimiter);
app.use('/v1/auth/worker/login', authLimiter);
app.use('/v1/auth/worker/forgot-password', authLimiter);
app.use('/v1/auth/worker/reset-password', authLimiter);
app.use('/v1/auth/email-verification/request', authLimiter);
app.use('/v1/auth/email-verification/confirm', authLimiter);
app.use('/v1/auth/company/register', authLimiter);
app.use('/v1/auth/company/complete-registration', authLimiter);
app.use('/v1/auth/company/login', authLimiter);
app.use('/v1/auth/company/forgot-password', authLimiter);
app.use('/v1/auth/company/reset-password', authLimiter);
app.use('/v1/auth/admin/login', authLimiter);
app.use('/v1/auth/admin/forgot-password', authLimiter);
app.use('/v1/auth/verify-otp', authLimiter);

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

try {
  const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
  const swaggerDoc = yaml.load(fs.readFileSync(swaggerPath, 'utf8')) as object;
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  logger.info('Swagger UI mounted', { path: '/docs' });
} catch (e) {
  logger.warn('swagger.yaml could not be loaded', { error: e instanceof Error ? e.message : String(e) });
}

app.use('/v1/auth', authRouter);
app.use('/v1/taxonomy', taxonomyRouter);
app.use('/v1', companiesRouter);
app.use('/v1', workersRouter);
app.use('/v1/orders', assignCompatibilityRouter);
app.use('/v1/orders', ordersRouter);
app.use('/v1/assignments', assignmentsRouter);
app.use('/v1/attendance', attendanceRouter);
app.use('/v1/ratings', ratingsRouter);
app.use('/v1/admin/reports', reportsRouter);
app.use('/v1/admin/admins', adminsRouter);
app.use('/v1/company/reports', companyReportsRouter);
app.use('/v1/notifications', notificationsRouter);

Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;

function parseCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function redactSensitiveUrl(url: string): string {
  return url
    .replace(
      /(\/v1\/attendance\/kiosk-sessions\/)[^/?\s]+/g,
      '$1:kiosk_token'
    )
    .replace(
      /(\/v1\/attendance\/venue-kiosks\/)[^/?\s]+/g,
      '$1:kiosk_token'
    )
    .replace(/(\/kiosk\/)[^/?\s]+/g, '$1:kiosk_token')
    .replace(/(\/qr-kiosk\/)[^/?\s]+/g, '$1:kiosk_token');
}
