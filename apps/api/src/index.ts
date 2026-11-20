import { env } from './env.js';
import { buildServer } from './server.js';
import { prisma } from './db.js';
import { startReminderLoop } from './projects/reminders.js';

async function main() {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    // The morning "services due today" email (src/projects/reminders.ts).
    startReminderLoop(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
