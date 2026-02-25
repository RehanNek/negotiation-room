import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { NextFunction, Request, Response } from 'express';
import { recoverMessageAddress } from 'viem';
import { badRequest, forbidden, unauthorized } from '../errors';

interface AuthChallenge {
  walletAddress: string;
  message: string;
  expiresAtMs: number;
}

interface AuthSession {
  walletAddress: string;
  mode: 'signature' | 'demo';
  expiresAtMs: number;
}

interface VerifyChallengeParams {
  wallet_address: string;
  nonce: string;
  signature: string;
}

const challenges = new Map<string, AuthChallenge>();
const sessions = new Map<string, AuthSession>();

function envNumber(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBoolean(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function isValidEvmWallet(wallet: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(wallet);
}

function cleanupExpiredRecords(): void {
  const now = Date.now();
  for (const [nonce, challenge] of challenges.entries()) {
    if (challenge.expiresAtMs <= now) challenges.delete(nonce);
  }
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAtMs <= now) sessions.delete(token);
  }
}

function issueSession(walletAddress: string, mode: 'signature' | 'demo') {
  cleanupExpiredRecords();
  const ttlSeconds = envNumber('AUTH_TOKEN_TTL_SECONDS', 60 * 60 * 24);
  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const token = uuidv4();
  sessions.set(token, { walletAddress: normalizeWallet(walletAddress), mode, expiresAtMs });
  return {
    token,
    wallet_address: normalizeWallet(walletAddress),
    mode,
    expires_at: new Date(expiresAtMs).toISOString(),
  };
}

export function isDemoModeEnabled(): boolean {
  return envBoolean('AUTH_DEMO_MODE', true);
}

function isDemoWalletOverrideAllowed(): boolean {
  const explicit = process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE;
  if (explicit !== undefined) {
    return explicit.toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'production';
}

export function createAuthChallenge(walletAddress: string): {
  nonce: string;
  message: string;
  expires_at: string;
} {
  cleanupExpiredRecords();
  if (!isValidEvmWallet(walletAddress)) {
    throw badRequest('wallet_address must be a valid EVM address');
  }

  const normalizedWallet = normalizeWallet(walletAddress);
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const challengeTtlSeconds = envNumber('AUTH_CHALLENGE_TTL_SECONDS', 5 * 60);
  const expiresAtMs = Date.now() + challengeTtlSeconds * 1000;
  const message = [
    'Sign in to The Room',
    `Wallet: ${normalizedWallet}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    '',
    'Only sign this message if you trust this app.',
  ].join('\n');

  challenges.set(nonce, {
    walletAddress: normalizedWallet,
    message,
    expiresAtMs,
  });

  return {
    nonce,
    message,
    expires_at: new Date(expiresAtMs).toISOString(),
  };
}

export async function verifyAuthChallenge(params: VerifyChallengeParams): Promise<{
  token: string;
  wallet_address: string;
  mode: 'signature' | 'demo';
  expires_at: string;
}> {
  cleanupExpiredRecords();
  const wallet = normalizeWallet(params.wallet_address);
  if (!isValidEvmWallet(wallet)) {
    throw badRequest('wallet_address must be a valid EVM address');
  }
  if (!params.nonce || !params.signature) {
    throw badRequest('nonce and signature are required');
  }

  const challenge = challenges.get(params.nonce);
  if (!challenge) throw unauthorized('Challenge is invalid or expired');
  if (challenge.walletAddress !== wallet) throw unauthorized('Challenge wallet mismatch');
  if (challenge.expiresAtMs <= Date.now()) {
    challenges.delete(params.nonce);
    throw unauthorized('Challenge is invalid or expired');
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverMessageAddress({
      message: challenge.message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    throw unauthorized('Invalid signature');
  }

  if (normalizeWallet(recoveredAddress) !== wallet) {
    throw unauthorized('Invalid signature');
  }

  challenges.delete(params.nonce);
  return issueSession(wallet, 'signature');
}

export function createDemoSession(walletAddress?: string): {
  token: string;
  wallet_address: string;
  mode: 'signature' | 'demo';
  expires_at: string;
} {
  if (!isDemoModeEnabled()) {
    throw unauthorized('Demo mode is disabled');
  }

  let wallet: string;
  if (walletAddress && walletAddress.trim()) {
    if (!isDemoWalletOverrideAllowed()) {
      throw forbidden('Demo wallet override is disabled');
    }
    if (!isValidEvmWallet(walletAddress.trim())) {
      throw badRequest('wallet_address must be a valid EVM address');
    }
    wallet = normalizeWallet(walletAddress);
  } else {
    wallet = `0x${crypto.randomBytes(20).toString('hex')}`;
  }

  return issueSession(wallet, 'demo');
}

export function getSessionFromToken(token: string): AuthSession | null {
  cleanupExpiredRecords();
  const session = sessions.get(token);
  return session ?? null;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next(unauthorized('Missing Bearer token'));
    return;
  }

  const session = getSessionFromToken(token);
  if (!session) {
    next(unauthorized('Session is invalid or expired'));
    return;
  }

  req.authWallet = session.walletAddress;
  req.authSessionMode = session.mode;
  next();
}
