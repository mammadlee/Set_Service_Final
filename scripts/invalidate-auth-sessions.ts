import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { runAuthSessionInvalidator } from '../src/tools/invalidate-auth-sessions';

export * from '../src/tools/invalidate-auth-sessions';

if (require.main === module) {
  runAuthSessionInvalidator()
    .catch((error: unknown) => {
      console.error('[JWT rotation] Failed:', error instanceof Error ? error.message : 'unknown error');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
