import express from 'express';
import cors from 'cors';
import { getDb } from './db';
import authRoutes from './routes/auth';
import negotiateRoutes from './routes/negotiate';
import contractRoutes from './routes/contract';
import reputationRoutes from './routes/reputation';
import attestationRoutes from './routes/attestation';
import { errorMiddleware } from './routes/utils';

export async function createApp() {
  await getDb();

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'the-room', timestamp: new Date().toISOString() });
  });

  app.use('/auth', authRoutes);
  app.use('/negotiate', negotiateRoutes);
  app.use('/contract', contractRoutes);
  app.use('/reputation', reputationRoutes);
  app.use('/attestation', attestationRoutes);
  app.use(errorMiddleware);

  return app;
}
