import { Context, Next } from 'hono';

/**
 * Production logging middleware.
 * Logs structured JSON for each request (only in production mode).
 */
export const requestLogger = async (c: Context, next: Next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // Only log in production (avoid noise in dev)
  if (c.env.DEV_MODE !== 'true') {
    // eslint-disable-next-line no-console -- structured request logging
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method,
      path,
      status,
      duration,
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('cf-connecting-ip')
    }));
  }
};
