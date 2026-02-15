import { Context } from 'hono';
import { createLogger } from './logger';

const logger = createLogger('http');

export type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 500 | 501 | 502 | 503;

export const jsonOk = (c: Context, body: Record<string, unknown> = {}) => c.json({ ok: true, ...body });

export const jsonError = (c: Context, message: string, status: ErrorStatusCode = 500, data?: Record<string, unknown>) => {
  logger.error(message);
  const response = data ? { ok: false, message, ...data } : { ok: false, message };
  return c.json(response, status);
};
