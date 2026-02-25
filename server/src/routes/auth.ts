import { type RequestHandler, Router } from 'express';
import { badRequest } from '../errors';
import { createInMemoryRateLimiter } from '../middleware/rate-limit';
import {
  createAuthChallenge,
  createDemoSession,
  isDemoModeEnabled,
  requireAuth,
  verifyAuthChallenge,
} from '../services/auth';
import { requireBodyFields, route } from './utils';

const router = Router();

function envInt(key: string, fallback: number, min: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function shouldEnableAuthRateLimit(): boolean {
  if (process.env.AUTH_RATE_LIMIT_ENABLED !== undefined) {
    return process.env.AUTH_RATE_LIMIT_ENABLED.toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'test';
}

const authChallengeRateLimit = createInMemoryRateLimiter({
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
  max: envInt('AUTH_CHALLENGE_RATE_LIMIT_MAX', 60, 10),
  keyPrefix: 'auth-challenge',
  message: 'Too many auth challenge attempts. Please retry shortly.',
});

const authVerifyRateLimit = createInMemoryRateLimiter({
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
  max: envInt('AUTH_VERIFY_RATE_LIMIT_MAX', 60, 10),
  keyPrefix: 'auth-verify',
  message: 'Too many auth verification attempts. Please retry shortly.',
});

const authDemoRateLimit = createInMemoryRateLimiter({
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 1_000),
  max: envInt('AUTH_DEMO_RATE_LIMIT_MAX', 40, 10),
  keyPrefix: 'auth-demo',
  message: 'Too many demo auth attempts. Please retry shortly.',
});

function withOptionalRateLimit(handler: RequestHandler, limiter: RequestHandler): RequestHandler[] {
  return shouldEnableAuthRateLimit() ? [limiter, handler] : [handler];
}

router.post('/challenge', ...withOptionalRateLimit(route((req, res) => {
  requireBodyFields(req.body, ['wallet_address']);
  const { wallet_address } = req.body;
  const result = createAuthChallenge(wallet_address);
  res.json(result);
}), authChallengeRateLimit));

router.post('/verify', ...withOptionalRateLimit(route(async (req, res) => {
  requireBodyFields(req.body, ['wallet_address', 'nonce', 'signature']);
  const { wallet_address, nonce, signature } = req.body;
  const result = await verifyAuthChallenge({ wallet_address, nonce, signature });
  res.json(result);
}), authVerifyRateLimit));

router.post('/demo', ...withOptionalRateLimit(route((req, res) => {
  if (!isDemoModeEnabled()) throw badRequest('Demo mode is disabled');
  const walletAddress = typeof req.body?.wallet_address === 'string' ? req.body.wallet_address : undefined;
  const result = createDemoSession(walletAddress);
  res.json(result);
}), authDemoRateLimit));

router.get('/me', requireAuth, route((req, res) => {
  if (!req.authWallet || !req.authSessionMode) throw badRequest('No active session');
  res.json({
    wallet_address: req.authWallet,
    mode: req.authSessionMode,
  });
}));

export default router;
