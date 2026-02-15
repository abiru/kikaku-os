import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as Sentry from '@sentry/cloudflare';
import type { Env } from './env';
import { jsonError, jsonOk } from './lib/http';
import { clerkAuth } from './middleware/clerkAuth';
import { requestLogger } from './middleware/logging';
import { rateLimit } from './middleware/rateLimit';
import { sendAlert } from './lib/alerts';
import { captureException, getSentryConfig } from './lib/sentry';
import { jstYesterdayStringFromMs } from './lib/date';
import { registerRoutes } from './routes';
import { generateDailyReport } from './services/dailyReport';
import { generateStripeEvidence } from './services/stripeEvidence';
import { renderDailyCloseHtml } from './services/renderDailyCloseHtml';
import { putJson, putText } from './lib/r2';
import { upsertDocument } from './services/documents';
import { journalizeDailyClose } from './services/journalize';
import { enqueueDailyCloseAnomaly } from './services/inboxAnomalies';
import { runAllAnomalyChecks } from './services/anomalyRules';
import { startDailyCloseRun, completeDailyCloseRun } from './services/dailyCloseRuns';

const app = new Hono<Env>();

// Global error handler - ensures all errors return JSON
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  // Capture exception for error tracking (production only)
  captureException(err, {
    path: c.req.path,
    method: c.req.method,
    env: c.env
  });

  return c.json(
    { ok: false, message: 'Internal Server Error' },
    500
  );
});

/**
 * Get allowed CORS origins based on environment.
 * Includes localhost for development and configured storefront URL.
 */
const getAllowedOrigins = (env: Env['Bindings']): string[] => {
  const origins: string[] = [];

  // Only allow localhost origins in development mode
  if (env.DEV_MODE === 'true') {
    origins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4321',
      'http://127.0.0.1:4321'
    );
  }

  // Add configured storefront URL (works for both dev and production)
  if (env.STOREFRONT_BASE_URL) {
    origins.push(env.STOREFRONT_BASE_URL);
  }

  return origins;
};

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = getAllowedOrigins(c.env);
      return origin && allowed.includes(origin) ? origin : undefined;
    },
    allowHeaders: ['Content-Type', 'x-admin-key', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400
  })
);

app.options('*', (c) => c.body(null, 204));

// Enable foreign key constraints (D1/SQLite disables by default)
app.use('*', async (c, next) => {
  try {
    await c.env.DB.prepare('PRAGMA foreign_keys = ON').run();
  } catch {
    // Non-fatal: log and continue if DB not available (e.g., health check)
  }
  return next();
});

// Security headers middleware
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '0');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// Production request logging (after CORS, before auth)
app.use('*', requestLogger);

// Rate limiting: general API (120 req/min), stricter for sensitive endpoints
app.use('/payments/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'pay' }));
app.use('/checkout/*', rateLimit({ max: 20, windowSeconds: 60, prefix: 'co' }));
app.use('/store/contact', rateLimit({ max: 5, windowSeconds: 60, prefix: 'contact' }));
app.use('/store/newsletter/*', rateLimit({ max: 5, windowSeconds: 60, prefix: 'nl' }));
app.use('/quotations', rateLimit({ max: 10, windowSeconds: 60, prefix: 'quot' }));
app.use('/quotations/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'quot' }));
app.use('/ai/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'ai' }));
app.use('*', rateLimit({ max: 120, windowSeconds: 60, prefix: 'global' }));

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  if (c.req.path === '/health') return next();
  if (c.req.path.startsWith('/webhooks/stripe')) return next();
  if (c.req.path.startsWith('/stripe/webhook')) return next();
  // Public checkout endpoints
  if (c.req.path.startsWith('/checkout/session')) return next();
  if (c.req.method === 'GET' && c.req.path === '/checkout/config') return next();
  if (c.req.method === 'POST' && c.req.path === '/checkout/validate-coupon') return next();
  if (c.req.method === 'POST' && c.req.path === '/checkout/quote') return next();
  // Public payment endpoints
  if (c.req.method === 'POST' && c.req.path === '/payments/intent') return next();
  // Public quotation endpoints (customer-facing, supports numeric ID and public token)
  if (c.req.method === 'POST' && c.req.path === '/quotations') return next();
  if (c.req.method === 'GET' && /^\/quotations\/[A-Za-z0-9]+$/.test(c.req.path)) return next();
  if (c.req.method === 'GET' && /^\/quotations\/[A-Za-z0-9]+\/html$/.test(c.req.path)) return next();
  if (c.req.method === 'POST' && /^\/quotations\/[A-Za-z0-9]+\/accept$/.test(c.req.path)) return next();
  if (c.req.method === 'POST' && c.req.path === '/store/newsletter/subscribe') return next();
  if (c.req.method === 'GET' && c.req.path === '/dev/ping') return next();
  // Public R2 image endpoint for Stripe checkout
  if (c.req.method === 'GET' && c.req.path === '/r2') return next();
  if (
    c.req.method === 'GET' &&
    (c.req.path === '/store' || c.req.path.startsWith('/store/'))
  ) {
    return next();
  }
  // Public order status endpoint for polling (supports numeric ID and public token)
  if (c.req.method === 'GET' && /^\/orders\/[A-Za-z0-9]+$/.test(c.req.path)) return next();
  return clerkAuth(c, next);
});

app.get('/', (c) => jsonOk(c, { message: 'led kikaku os api' }));

// Register all routes (organized by domain in routes/index.ts)
registerRoutes(app);

app.get('/r2', async (c) => {
  const key = c.req.query('key');
  if (!key) return jsonError(c, 'key required', 400);

  // Security: Only allow access to storefront image assets
  if (
    !key.startsWith('products/') &&
    !key.startsWith('product-images/') &&
    !key.startsWith('home-heroes/')
  ) {
    return jsonError(c, 'Access denied', 403);
  }

  try {
    const obj = await c.env.R2.get(key);
    if (!obj) return jsonError(c, 'not found', 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-allow-methods', 'GET');
    if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType);
    return new Response(obj.body, { headers });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch object');
  }
});

const buildJstYesterday = () => jstYesterdayStringFromMs();

const runDailyCloseArtifacts = async (env: Env['Bindings'], date: string) => {
  const runId = await startDailyCloseRun(env, date, false);

  try {
    const report = await generateDailyReport(env, date);
    const evidence = await generateStripeEvidence(env, date);
    const html = renderDailyCloseHtml(report, evidence);

    const baseKey = `daily-close/${date}`;
    const reportKey = `${baseKey}/report.json`;
    const evidenceKey = `${baseKey}/stripe-evidence.json`;
    const htmlKey = `${baseKey}/report.html`;

    await putJson(env.R2, reportKey, report);
    await putJson(env.R2, evidenceKey, evidence);
    await putText(env.R2, htmlKey, html, 'text/html; charset=utf-8');

    await upsertDocument(env, 'daily_close', date, reportKey, 'application/json');
    await upsertDocument(env, 'daily_close', date, evidenceKey, 'application/json');
    await upsertDocument(env, 'daily_close', date, htmlKey, 'text/html');

    const journalResult = await journalizeDailyClose(env, date, report);
    const anomalyCreated = await enqueueDailyCloseAnomaly(env, report, {
      reportKey,
      htmlKey
    });

    await completeDailyCloseRun(env, runId, {
      status: 'success',
      artifactsGenerated: 3,
      ledgerEntriesCreated: journalResult.entriesCreated,
      anomalyDetected: anomalyCreated
    });

    // Daily close completed - result recorded in daily_close_runs table
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await completeDailyCloseRun(env, runId, {
      status: 'failed',
      errorMessage
    });
    console.error(`Daily close failed for ${date}: runId=${runId}`, err);

    // Send critical alert for daily close failure
    await sendAlert(env, 'critical', `Daily close failed for ${date}`, {
      runId,
      error: errorMessage,
      date
    });

    throw err;
  }
};

const runCleanupTasks = async (env: Env['Bindings']) => {
  // Delete expired checkout quotes
  await env.DB.prepare(
    `DELETE FROM checkout_quotes WHERE expires_at < datetime('now')`
  ).run();

  // Cancel stale pending orders (older than 24 hours with no payment)
  await env.DB.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
     WHERE status = 'pending'
       AND created_at < datetime('now', '-24 hours')`
  ).run();
};

const runAnomalyChecks = async (env: Env['Bindings'], date: string) => {
  try {
    await runAllAnomalyChecks(env, date);
  } catch (err) {
    console.error('Anomaly check failed:', err);
  }
};

/**
 * Create the worker export with optional Sentry wrapping.
 * If SENTRY_DSN is configured, wrap with Sentry for error tracking.
 * Otherwise, export the app directly.
 */
const createWorkerExport = () => {
  const baseExport = {
    fetch: app.fetch,
    scheduled: async (
      controller: ScheduledController,
      env: Env['Bindings'],
      ctx: ExecutionContext
    ) => {
      const date = buildJstYesterday();

      // Wrap with Sentry monitor if configured
      if (env.SENTRY_DSN) {
        ctx.waitUntil(
          Sentry.withMonitor('daily-close', async () => {
            await runDailyCloseArtifacts(env, date);
          })
        );
        ctx.waitUntil(
          Sentry.withMonitor('anomaly-checks', async () => {
            await runAnomalyChecks(env, date);
          })
        );
      } else {
        ctx.waitUntil(runDailyCloseArtifacts(env, date));
        ctx.waitUntil(runAnomalyChecks(env, date));
      }

      // Cleanup tasks (always run, independent of Sentry)
      ctx.waitUntil(runCleanupTasks(env));
    }
  };

  // Wrap with Sentry if configured
  // Note: Sentry.withSentry expects a function that returns config, and the app
  return Sentry.withSentry(
    (env: Env['Bindings']) => {
      const config = getSentryConfig(env);
      if (!config) {
        // Return minimal config that effectively disables Sentry
        return {
          dsn: '',
          enabled: false
        };
      }
      return config;
    },
    baseExport
  );
};

export default createWorkerExport();
