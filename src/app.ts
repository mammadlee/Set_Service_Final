import './instrument'; // Sentry — ən əvvəl import olunmalıdır
import express from 'express';
import cors from 'cors';
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
import assignmentsRouter, { assignRouter } from './modules/assignments/assignments.router';
import attendanceRouter from './modules/attendance/attendance.router';
import ratingsRouter from './modules/ratings/ratings.router';
import notificationsRouter from './modules/notifications/notifications.router';

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Çox sayda sorğu — 5 dəqiqə gözlə', code: 'TOO_MANY_REQUESTS' },
});

app.use(globalLimiter);
app.use('/v1/auth/register', authLimiter);
app.use('/v1/auth/worker/register', authLimiter);
app.use('/v1/auth/worker/request-otp', authLimiter);
app.use('/v1/auth/worker/login', authLimiter);
app.use('/v1/auth/company/register', authLimiter);
app.use('/v1/auth/company/login', authLimiter);
app.use('/v1/auth/admin/login', authLimiter);
app.use('/v1/auth/verify-otp', authLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Swagger UI ────────────────────────────────────────────────────────────────
try {
  const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
  const swaggerDoc = yaml.load(fs.readFileSync(swaggerPath, 'utf8')) as object;
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  console.log('[Swagger] UI hazırdır: http://localhost:3000/docs');
} catch (e) {
  console.warn('[Swagger] swagger.yaml oxuna bilmədi:', e);
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/v1/auth', authRouter);
app.use('/v1', companiesRouter);     // /v1/companies/me, /v1/admin/companies
app.use('/v1', workersRouter);       // /v1/workers/me, /v1/admin/workers
app.use('/v1/orders', assignRouter); // /v1/orders/:id/assign
app.use('/v1/orders', ordersRouter);
app.use('/v1/assignments', assignmentsRouter);
app.use('/v1/attendance', attendanceRouter);
app.use('/v1/ratings', ratingsRouter);
app.use('/v1/notifications', notificationsRouter);

// ── Sentry error handler (Sentry-nin öz handler-i) ───────────────────────────
Sentry.setupExpressErrorHandler(app);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
