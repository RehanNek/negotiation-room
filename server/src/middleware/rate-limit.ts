import type { Request, RequestHandler, Response } from 'express';

export interface InMemoryRateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  skip?: (req: Request) => boolean;
  message?: string;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

function readClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0] || '').trim() || req.ip || req.socket.remoteAddress || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function setLimitHeaders(res: Response, max: number, remaining: number, resetAtMs: number): void {
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(resetAtMs / 1000)));
}

export function createInMemoryRateLimiter(options: InMemoryRateLimitOptions): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();
  const windowMs = Math.max(1000, Math.trunc(options.windowMs));
  const max = Math.max(1, Math.trunc(options.max));
  const keyPrefix = options.keyPrefix || 'global';
  const message = options.message || 'Too many requests. Please retry shortly.';

  return (req, res, next) => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${keyPrefix}:${readClientIp(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAtMs <= now) {
      buckets.set(key, { count: 1, resetAtMs: now + windowMs });
      setLimitHeaders(res, max, max - 1, now + windowMs);
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
      setLimitHeaders(res, max, 0, existing.resetAtMs);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: message, code: 'RATE_LIMITED' });
      return;
    }

    existing.count += 1;
    buckets.set(key, existing);
    setLimitHeaders(res, max, max - existing.count, existing.resetAtMs);
    next();
  };
}
