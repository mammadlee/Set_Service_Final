import 'dotenv/config';
import { checkEnv } from './lib/check-env';
checkEnv();

import app from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { connectRedis, disconnectRedis } from './lib/redis';
import { assertPushConfiguration } from './lib/fcm';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  assertPushConfiguration();
  await prisma.$connect();
  logger.info('PostgreSQL connection is ready');

  await connectRedis();

  app.listen(PORT, () => {
    logger.info('HTTP server started', {
      port: PORT,
      docs: '/docs',
      health: '/health',
    });
  });
}

main().catch((err) => {
  logger.error('Startup error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received; shutting down`);
  await disconnectRedis();
  await prisma.$disconnect();
  process.exit(0);
}
