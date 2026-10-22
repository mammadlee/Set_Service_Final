import 'dotenv/config';
import './instrument';
import { createServer, type Server } from 'node:http';
import * as Sentry from '@sentry/node';
import { checkEnv } from './lib/check-env';

checkEnv();

import { assertPushConfiguration } from './lib/fcm';
import { logger } from './lib/logger';
import {
  getOutboxProcessorHealth,
  renderOutboxMetrics,
  startOutboxProcessor,
  stopOutboxProcessor,
} from './lib/outbox';
import { prisma } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';

const HEALTH_PORT = positiveInteger(process.env.OUTBOX_HEALTH_PORT, 3001);
const FAILURE_THRESHOLD = positiveInteger(
  process.env.OUTBOX_MAX_CONSECUTIVE_FAILURES,
  5,
);

let healthServer: Server | null = null;
let shuttingDown = false;

async function main(): Promise<void> {
  assertPushConfiguration();
  await prisma.$connect();
  await connectRedis();
  startOutboxProcessor(undefined, {
    failureThreshold: FAILURE_THRESHOLD,
    unrefTimer: false,
    onUnhealthy(error) {
      Sentry.captureException(error);
      void shutdown('OUTBOX_PROCESSOR_UNHEALTHY', 1);
    },
  });
  healthServer = createHealthServer();
  await listen(healthServer, HEALTH_PORT);
  logger.info('Outbox worker started', {
    health_port: HEALTH_PORT,
    failure_threshold: FAILURE_THRESHOLD,
  });
}

void main().catch(async (error) => {
  logger.error('Outbox worker startup failed', { error: safeError(error) });
  await shutdown('STARTUP_ERROR', 1);
});

process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
process.once('SIGINT', () => void shutdown('SIGINT', 0));
process.on('unhandledRejection', (reason) => {
  logger.error('Outbox worker unhandled rejection', { error: safeError(reason) });
  void shutdown('UNHANDLED_REJECTION', 1);
});
process.on('uncaughtException', (error) => {
  logger.error('Outbox worker uncaught exception', { error: safeError(error) });
  void shutdown('UNCAUGHT_EXCEPTION', 1);
});

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  logger.info(`${signal} received; stopping outbox worker`);
  await stopOutboxProcessor();

  const results = await Promise.allSettled([
    closeHealthServer(),
    disconnectRedis(),
    prisma.$disconnect(),
    Sentry.flush(2_000),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('Outbox worker dependency close failed', { error: safeError(result.reason) });
      process.exitCode = 1;
    }
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function createHealthServer(): Server {
  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/metrics') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      response.end(renderOutboxMetrics());
      return;
    }

    if (request.url === '/health') {
      const health = getOutboxProcessorHealth();
      response.statusCode = health.healthy ? 200 : 503;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        status: health.healthy ? 'ok' : 'unhealthy',
        processor: health,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'not_found' }));
  });
}

async function listen(instance: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      instance.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      instance.off('error', onError);
      resolve();
    };
    instance.once('error', onError);
    instance.once('listening', onListening);
    instance.listen(port, '0.0.0.0');
  });
}

async function closeHealthServer(): Promise<void> {
  if (!healthServer) return;
  const instance = healthServer;
  healthServer = null;
  await new Promise<void>((resolve, reject) => {
    instance.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
