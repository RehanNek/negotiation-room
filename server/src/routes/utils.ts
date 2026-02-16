import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { badRequest, isAppError } from '../errors';

type RouteHandler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

export function route(handler: RouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requireBodyFields(body: unknown, fields: string[]): void {
  const source = typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};

  const missing = fields.filter((field) => {
    const value = source[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw badRequest(`Missing required fields: ${missing.join(', ')}`);
  }
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  console.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err instanceof Error
      ? err.message
      : 'Internal server error';
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR' });
}
