import { Context } from 'hono';

export const jsonOk = (c: Context, body: Record<string, unknown> = {}) => c.json({ ok: true, ...body });

export const jsonError = (c: Context, message: string, status = 500) => {
  console.error(message);
  return c.json({ ok: false, message }, status);
};
