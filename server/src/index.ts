import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { getDb } from './db';
import negotiateRoutes from './routes/negotiate';
import contractRoutes from './routes/contract';
import reputationRoutes from './routes/reputation';
import attestationRoutes from './routes/attestation';

async function main() {
  // Initialize database
  await getDb();
  console.log('Database initialized');

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'the-room', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/negotiate', negotiateRoutes);
  app.use('/contract', contractRoutes);
  app.use('/reputation', reputationRoutes);
  app.use('/attestation', attestationRoutes);

  app.listen(PORT, () => {
    console.log(`The Room server running on port ${PORT}`);
    console.log(`EigenAI: ${process.env.EIGENAI_BASE_URL || 'not configured'}`);
    console.log(`Database: ${process.env.DATABASE_PATH || './data/room.db'}`);
  });
}

main().catch(console.error);
