import express from 'express';
import cors from 'cors';
import { getDb } from './db';
import authRoutes from './routes/auth';
import negotiateRoutes from './routes/negotiate';
import contractRoutes from './routes/contract';
import reputationRoutes from './routes/reputation';
import attestationRoutes from './routes/attestation';
import { isEscrowEnabled } from './services/escrow-config';
import { createInMemoryRateLimiter } from './middleware/rate-limit';
import { errorMiddleware } from './routes/utils';

function parseCorsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function envBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
}

function envInt(key: string, fallback: number, min: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function shouldEnableRateLimit(): boolean {
  const fallback = process.env.NODE_ENV !== 'test';
  return envBoolean('RATE_LIMIT_ENABLED', fallback);
}

export async function createApp() {
  await getDb();

  const app = express();
  const allowedOrigins = parseCorsAllowedOrigins();
  const trustProxy = envBoolean('TRUST_PROXY', true);
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb';

  app.disable('x-powered-by');
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    console.warn('CORS_ALLOWED_ORIGINS is empty in production; all browser origins are currently allowed.');
  }

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

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
  app.use(express.json({ limit: jsonBodyLimit }));

  if (shouldEnableRateLimit()) {
    app.use(
      createInMemoryRateLimiter({
        windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
        max: envInt('RATE_LIMIT_MAX', 600, 10),
        keyPrefix: 'global',
        skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
        message: 'Too many requests. Please slow down and retry.',
      })
    );
  }

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
