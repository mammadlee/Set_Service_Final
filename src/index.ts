import 'dotenv/config';
import type { Server } from 'node:http';
import * as Sentry from '@sentry/node';
import { checkEnv } from './lib/check-env';

checkEnv();

import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { connectRedis, disconnectRedis } from './lib/redis';
import { assertPushConfiguration } from './lib/fcm';
import { startOutboxProcessor, stopOutboxProcessor } from './lib/outbox';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | null = null;
let shuttingDown = false;

async function main(): Promise<void> {
  assertPushConfiguration();
  await prisma.$connect();
  logger.info('PostgreSQL connection is ready');

  await connectRedis();

  server = app.listen(PORT, () => {
    const runOutboxInApi = shouldRunOutboxInApi();
    if (runOutboxInApi) {
      startOutboxProcessor(undefined, {
        failureThreshold: positiveInteger(
          process.env.OUTBOX_MAX_CONSECUTIVE_FAILURES,
          5,
        ),
        onUnhealthy(error) {
          Sentry.captureException(error);
          void shutdown('OUTBOX_PROCESSOR_UNHEALTHY', 1);
        },
      });
    }
    logger.info('HTTP server started', {
      port: PORT,
      outbox_mode: runOutboxInApi ? 'in_process' : 'external_worker',
      docs_enabled: process.env.NODE_ENV !== 'production' && process.env.SWAGGER_DOCS_ENABLED !== 'false',
      health: '/health',
      readiness: '/ready',
    });
  });
}

void main().catch(async (error) => {
  logger.error('Startup error', { error: safeError(error) });
  await shutdown('STARTUP_ERROR', 1);
});

process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
process.once('SIGINT', () => void shutdown('SIGINT', 0));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: safeError(reason) });
  void shutdown('UNHANDLED_REJECTION', 1);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: safeError(error) });
  void shutdown('UNCAUGHT_EXCEPTION', 1);
});

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  logger.info(`${signal} received; shutting down`);
  const outboxShutdown = stopOutboxProcessor();

  await closeServer();
  await outboxShutdown;
  const results = await Promise.allSettled([disconnectRedis(), prisma.$disconnect()]);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('Shutdown dependency close failed', { error: safeError(result.reason) });
      process.exitCode = 1;
    }
  }
}

async function closeServer(): Promise<void> {
  if (!server) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('HTTP graceful shutdown timed out; closing active connections');
      server?.closeAllConnections?.();
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    server!.close((error) => {
      clearTimeout(timeout);
      if (error) logger.error('HTTP server close failed', { error: safeError(error) });
      resolve();
    });
  });

  server = null;
}

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function shouldRunOutboxInApi(): boolean {
  const configured = process.env.OUTBOX_WORKER_ENABLED?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
