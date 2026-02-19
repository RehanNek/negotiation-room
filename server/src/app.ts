import express from 'express';
import cors from 'cors';
import { getDb } from './db';
import authRoutes from './routes/auth';
import negotiateRoutes from './routes/negotiate';
import contractRoutes from './routes/contract';
import reputationRoutes from './routes/reputation';
import attestationRoutes from './routes/attestation';
import { isEscrowEnabled } from './services/escrow-config';
import { errorMiddleware } from './routes/utils';

function parseCorsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export async function createApp() {
  await getDb();

  const app = express();
  const allowedOrigins = parseCorsAllowedOrigins();

  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'the-room',
      timestamp: new Date().toISOString(),
      escrow_enabled: isEscrowEnabled(),
    });
  });

  app.use('/auth', authRoutes);
  app.use('/negotiate', negotiateRoutes);
  app.use('/contract', contractRoutes);
  app.use('/reputation', reputationRoutes);
  app.use('/attestation', attestationRoutes);
  app.use(errorMiddleware);

  return app;
}
