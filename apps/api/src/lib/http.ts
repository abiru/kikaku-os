import { Context } from 'hono';

type ErrorStatusCode = 400 | 401 | 403 | 404 | 500 | 502 | 503;

export const jsonOk = (c: Context, body: Record<string, unknown> = {}) => c.json({ ok: true, ...body });

export const jsonError = (c: Context, message: string, status: ErrorStatusCode = 500) => {
  console.error(message);
  return c.json({ ok: false, message }, status);
};
