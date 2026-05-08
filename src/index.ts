import 'dotenv/config';
import { checkEnv } from './lib/check-env';
checkEnv(); // tələb olunan env var-lar yoxdursa burada dayanır

import app from './app';
import { prisma } from './lib/prisma';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  // DB bağlantısını yoxla
  await prisma.$connect();
  console.log('[DB] PostgreSQL bağlantısı uğurludur');

  app.listen(PORT, () => {
    console.log(`[Server] http://localhost:${PORT}`);
    console.log(`[Swagger] http://localhost:${PORT}/docs`);
    console.log(`[Health] http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[Startup Error]', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM — bağlanır...');
  await prisma.$disconnect();
  process.exit(0);
});
