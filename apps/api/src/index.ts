import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import * as Sentry from '@sentry/cloudflare';
import type { Env } from './env';
import { jsonError, jsonOk } from './lib/http';
import { createLogger } from './lib/logger';
import { clerkAuth } from './middleware/clerkAuth';
import { requestLogger } from './middleware/logging';
import { rateLimit } from './middleware/rateLimit';
import { csrfProtection } from './middleware/csrf';
import { sendAlert } from './lib/alerts';
import { captureException, getSentryConfig } from './lib/sentry';
import { jstYesterdayStringFromMs } from './lib/date';
import { AppError, generateErrorTrackingId } from './lib/errors';
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
import { checkInventoryAlerts } from './services/inventoryAlerts';

const logger = createLogger('app');

const app = new Hono<Env>();

/** Detect D1/database errors from error messages */
const isD1Error = (err: Error): boolean => {
  const msg = err.message.toLowerCase();
  return msg.includes('d1_error') ||
    msg.includes('database') ||
    msg.includes('sql') ||
    msg.includes('no such table') ||
    msg.includes('connection') ||
    (err.name === 'Error' && msg.includes('prepare'));
};

// Global error handler - ensures all errors return JSON
app.onError((err, c) => {
  // Handle known application errors with appropriate status codes
  if (err instanceof AppError) {
    const allowedStatuses = new Set([400, 401, 403, 404, 409, 500, 501, 502, 503]);
    const status = allowedStatuses.has(err.statusCode) ? err.statusCode : 500;
    const isServerError = status >= 500;

    if (isServerError) {
      const trackingId = generateErrorTrackingId();
      logger.error('Application error', { trackingId, error: String(err), path: c.req.path });
      captureException(err, {
        path: c.req.path,
        method: c.req.method,
        env: c.env
      });

      return c.json(
        { ok: false, message: 'Internal Server Error', code: 'INTERNAL_ERROR', trackingId },
        status as 500 | 501 | 502 | 503
      );
    }

    return c.json(
      { ok: false, message: err.message, code: err.code },
      status as 400 | 401 | 403 | 404 | 409
    );
  }

  // D1/database errors → 503 Service Unavailable with Retry-After
  if (isD1Error(err)) {
    const trackingId = generateErrorTrackingId();
    logger.error('Database error - returning 503', { trackingId, error: String(err), path: c.req.path });
    captureException(err, {
      path: c.req.path,
      method: c.req.method,
      env: c.env
    });
    // Non-blocking alert for DB failures
    c.executionCtx.waitUntil(
      sendAlert(c.env, 'critical', `Database error on ${c.req.method} ${c.req.path}`, {
        trackingId,
        error: err.message
      })
    );
    return c.json(
      { ok: false, message: 'Service temporarily unavailable', code: 'DB_UNAVAILABLE', trackingId },
      { status: 503, headers: { 'Retry-After': '30' } }
    );
  }

  // Unknown errors - log and return generic message
  const trackingId = generateErrorTrackingId();
  logger.error('Unhandled error', { trackingId, error: String(err), path: c.req.path });
  captureException(err, {
    path: c.req.path,
    method: c.req.method,
    env: c.env
  });
  return c.json(
    { ok: false, message: 'Internal Server Error', trackingId },
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
    allowHeaders: ['Content-Type', 'x-admin-key', 'x-csrf-token', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400
  })
);

app.options('*', (c) => c.body(null, 204));

// Startup validation: warn once if ADMIN_API_KEY is missing
let adminKeyChecked = false;
app.use('*', async (c, next) => {
  if (!adminKeyChecked) {
    adminKeyChecked = true;
    if (!c.env.ADMIN_API_KEY) {
      logger.error('ADMIN_API_KEY is not set - admin endpoints will be inaccessible');
    }
  }
  return next();
});

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
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Content-Security-Policy: stricter for JSON, allow inline styles for HTML
  const contentType = c.res.headers.get('Content-Type') || '';
  const isHtml = contentType.includes('text/html');
  const csp = isHtml
    ? "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
    : "default-src 'none'; frame-ancestors 'none'";
  c.res.headers.set('Content-Security-Policy', csp);
});

// Production request logging (after CORS, before auth)
app.use('*', requestLogger);

// Rate limiting: stricter for sensitive endpoints, moderate for storefront, relaxed global
app.use('/payments/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'pay' }));
app.use('/checkout/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'co' }));
app.use('/store/contact', rateLimit({ max: 5, windowSeconds: 60, prefix: 'contact' }));
app.use('/store/newsletter/*', rateLimit({ max: 5, windowSeconds: 60, prefix: 'nl' }));
app.use('/store/products/*/notify', rateLimit({ max: 5, windowSeconds: 60, prefix: 'restock' }));
app.use('/store/*', rateLimit({ max: 60, windowSeconds: 60, prefix: 'store' }));
app.use('/quotations', rateLimit({ max: 10, windowSeconds: 60, prefix: 'quot' }));
app.use('/quotations/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'quot' }));
app.use('/ai/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'ai' }));
app.use('/errors/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'err' }));
app.use('*', rateLimit({ max: 120, windowSeconds: 60, prefix: 'global' }));

// CSRF token endpoint - returns the current session's CSRF token
// The token is automatically set as an HttpOnly cookie by the middleware
app.get('/csrf-token', (c) => {
  // The csrfProtection middleware has already set the cookie for GET requests
  // We just need to return the token value from the cookie so clients can
  // include it in the x-csrf-token header for state-changing requests
  const tokenFromContext = c.get('csrfToken');
  const token =
    typeof tokenFromContext === 'string' && tokenFromContext.length > 0
      ? tokenFromContext
      : (getCookie(c, '__csrf') || '');
  return jsonOk(c, { token });
});

// CSRF protection for state-changing requests
app.use('*', csrfProtection());

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  if (c.req.path === '/health') return next();
  if (c.req.path === '/csrf-token') return next();
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
  // Public error reporting endpoint (client-side error tracking)
  if (c.req.method === 'POST' && c.req.path === '/errors/report') return next();
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
    headers.set('access-control-allow-origin', c.env.STOREFRONT_BASE_URL || '');
    headers.set('access-control-allow-methods', 'GET');
    if (obj.httpMetadata?.contentType) headers.set('content-type', obj.httpMetadata.contentType);
    return new Response(obj.body, { headers });
  } catch (err) {
    logger.error('Failed to fetch R2 object', { error: String(err) });
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
    logger.error(`Daily close failed for ${date}`, { runId, error: String(err) });

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
    logger.error('Anomaly check failed', { error: String(err) });
  }
};

const runInventoryAlerts = async (env: Env['Bindings'], date: string) => {
  try {
    await checkInventoryAlerts(env, date);
  } catch (err) {
    logger.error('Inventory alert check failed', { error: String(err) });
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

      // Inventory alerts (always run, independent of Sentry)
      ctx.waitUntil(runInventoryAlerts(env, date));

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
