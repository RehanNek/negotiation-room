import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { flushDb, stopDbPersistence } from './db';

function registerShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; flushing database before shutdown.`);
    try {
      flushDb();
    } finally {
      stopDbPersistence();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
  registerShutdownHandlers();
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.listen(PORT, () => {
    console.log(`The Room server running on port ${PORT}`);
    console.log(`EigenAI: ${process.env.EIGENAI_BASE_URL || 'not configured'}`);
    console.log(`Database: ${process.env.DATABASE_PATH || './data/room.db'}`);
  });
}

main().catch(console.error);
