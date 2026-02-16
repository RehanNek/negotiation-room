import { Router } from 'express';
import { badRequest } from '../errors';
import {
  createAuthChallenge,
  createDemoSession,
  isDemoModeEnabled,
  requireAuth,
  verifyAuthChallenge,
} from '../services/auth';
import { requireBodyFields, route } from './utils';

const router = Router();

router.post('/challenge', route((req, res) => {
  requireBodyFields(req.body, ['wallet_address']);
  const { wallet_address } = req.body;
  const result = createAuthChallenge(wallet_address);
  res.json(result);
}));

router.post('/verify', route(async (req, res) => {
  requireBodyFields(req.body, ['wallet_address', 'nonce', 'signature']);
  const { wallet_address, nonce, signature } = req.body;
  const result = await verifyAuthChallenge({ wallet_address, nonce, signature });
  res.json(result);
}));

router.post('/demo', route((req, res) => {
  if (!isDemoModeEnabled()) throw badRequest('Demo mode is disabled');
  const walletAddress = typeof req.body?.wallet_address === 'string' ? req.body.wallet_address : undefined;
  const result = createDemoSession(walletAddress);
  res.json(result);
}));

router.get('/me', requireAuth, route((req, res) => {
  if (!req.authWallet || !req.authSessionMode) throw badRequest('No active session');
  res.json({
    wallet_address: req.authWallet,
    mode: req.authSessionMode,
  });
}));

export default router;
