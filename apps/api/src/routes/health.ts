import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';

const health = new Hono<Env>();

health.get('/health', async (c) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    r2: 'unknown',
    timestamp: new Date().toISOString(),
    environment: c.env.DEV_MODE === 'true' ? 'development' : 'production'
  };

  try {
    const dbCheck = await c.env.DB.prepare('SELECT 1 as result').first();
    checks.database = dbCheck?.result === 1 ? 'ok' : 'error';
  } catch (error) {
    checks.database = 'error';
  }

  try {
    await c.env.R2.list({ limit: 1 });
    checks.r2 = 'ok';
  } catch (error) {
    checks.r2 = 'error';
  }

  const allHealthy = checks.database === 'ok' && checks.r2 === 'ok';

  return allHealthy
    ? jsonOk(c, checks)
    : jsonError(c, 'Health check failed', 503, checks);
});

export default health;
