import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';

const health = new Hono<Env>();

const REQUIRED_SECRETS = [
  'ADMIN_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CLERK_SECRET_KEY',
  'STOREFRONT_BASE_URL',
] as const;

function checkSecrets(env: Record<string, unknown>): {
  allConfigured: boolean;
  details: Record<string, boolean>;
} {
  const details: Record<string, boolean> = {};
  for (const key of REQUIRED_SECRETS) {
    details[key] = typeof env[key] === 'string' && env[key] !== '';
  }
  const allConfigured = Object.values(details).every(Boolean);
  return { allConfigured, details };
}

health.get('/health', async (c) => {
  const detailed = c.req.query('detailed') === 'true';
  const secretsResult = checkSecrets(c.env as unknown as Record<string, unknown>);

  const checks: Record<string, unknown> = {
    api: 'ok',
    database: 'unknown',
    r2: 'unknown',
    secrets: secretsResult.allConfigured ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    environment: c.env.DEV_MODE === 'true' ? 'development' : 'production',
  };

  try {
    const dbCheck = await c.env.DB.prepare('SELECT 1 as result').first();
    checks.database = dbCheck?.result === 1 ? 'ok' : 'error';
  } catch {
    checks.database = 'error';
  }

  try {
    await c.env.R2.list({ limit: 1 });
    checks.r2 = 'ok';
  } catch {
    checks.r2 = 'error';
  }

  if (detailed) {
    const adminKey = c.req.header('x-admin-key');
    if (!adminKey || adminKey !== c.env.ADMIN_API_KEY) {
      return jsonError(c, 'Unauthorized', 401);
    }
    checks.secretsDetail = Object.fromEntries(
      Object.entries(secretsResult.details).map(([k, v]) => [k, { configured: v }])
    );
  }

  const allHealthy =
    checks.database === 'ok' && checks.r2 === 'ok' && secretsResult.allConfigured;

  return allHealthy
    ? jsonOk(c, checks)
    : jsonError(c, 'Health check failed', 503, checks);
});

export default health;
