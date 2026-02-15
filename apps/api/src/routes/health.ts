import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import { timingSafeCompare } from '../middleware/clerkAuth';

const health = new Hono<Env>();

const REQUIRED_SECRETS = [
  'ADMIN_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CLERK_SECRET_KEY',
  'STOREFRONT_BASE_URL',
] as const;

const OPTIONAL_SECRETS = [
  'RESEND_API_KEY',
] as const;

function isConfigured(env: Record<string, unknown>, key: string): boolean {
  return typeof env[key] === 'string' && env[key] !== '';
}

function checkSecrets(env: Record<string, unknown>): {
  allConfigured: boolean;
  required: Record<string, boolean>;
  optional: Record<string, boolean>;
} {
  const required: Record<string, boolean> = {};
  for (const key of REQUIRED_SECRETS) {
    required[key] = isConfigured(env, key);
  }
  const optional: Record<string, boolean> = {};
  for (const key of OPTIONAL_SECRETS) {
    optional[key] = isConfigured(env, key);
  }
  const allConfigured = Object.values(required).every(Boolean);
  return { allConfigured, required, optional };
}

function isAuthenticated(c: { req: { header: (name: string) => string | undefined }; env: { ADMIN_API_KEY?: string } }): boolean {
  const adminKey = c.req.header('x-admin-key');
  return !!(adminKey && c.env.ADMIN_API_KEY && timingSafeCompare(adminKey, c.env.ADMIN_API_KEY));
}

health.get('/health', async (c) => {
  const detailed = c.req.query('detailed') === 'true';
  const authenticated = isAuthenticated(c);

  // Detailed view requires authentication
  if (detailed && !authenticated) {
    return jsonError(c, 'Unauthorized', 401);
  }

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

  const allHealthy =
    checks.database === 'ok' && checks.r2 === 'ok' && secretsResult.allConfigured;

  // Unauthenticated: return only status
  if (!authenticated) {
    return allHealthy
      ? jsonOk(c, { status: 'ok' })
      : jsonError(c, 'Health check failed', 503);
  }

  // Authenticated: return full details
  if (detailed) {
    checks.secretsDetail = {
      required: Object.fromEntries(
        Object.entries(secretsResult.required).map(([k, v]) => [k, { configured: v }])
      ),
      optional: Object.fromEntries(
        Object.entries(secretsResult.optional).map(([k, v]) => [k, { configured: v }])
      ),
    };
  }

  return allHealthy
    ? jsonOk(c, checks)
    : jsonError(c, 'Health check failed', 503, checks);
});

export default health;
