import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { flushDb, stopDbPersistence } from './db';
import { startEscrowScheduler, stopEscrowScheduler } from './services/escrow';
import { isDemoModeEnabled } from './services/auth';

function registerShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; flushing database before shutdown.`);
    try {
      flushDb();
    } finally {
      stopEscrowScheduler();
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
  startEscrowScheduler();
  const PORT = parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Room server running on port ${PORT}`);
    console.log(`EigenAI: ${process.env.EIGENAI_BASE_URL || 'not configured'}`);
    console.log(`Database: ${process.env.DATABASE_PATH || './data/room.db'}`);
    if (process.env.NODE_ENV === 'production' && isDemoModeEnabled()) {
      console.warn('AUTH_DEMO_MODE is enabled in production. Disable it for public launch unless intentionally exposing demo auth.');
    }
  });
}

main().catch(console.error);
