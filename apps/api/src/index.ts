import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { jsonError, jsonOk } from './lib/http';
import { jstYesterdayStringFromMs } from './lib/date';
import reports from './routes/reports';
import accounting from './routes/accounting';
import inbox from './routes/inbox';
import dailyCloseArtifacts from './routes/dailyCloseArtifacts';
import dev from './routes/dev';
import inventory from './routes/inventory';
import ai from './routes/ai';
import adminOrders from './routes/adminOrders';
import adminProducts from './routes/adminProducts';
import adminReports from './routes/adminReports';
import adminStripeEvents from './routes/adminStripeEvents';
import adminCustomers from './routes/adminCustomers';
import adminCoupons from './routes/adminCoupons';
import fulfillments from './routes/fulfillments';
import stripe from './routes/stripe';
import checkout from './routes/checkout';
import storefront from './routes/storefront';
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

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4321',
  'http://127.0.0.1:4321'
];

app.use(
  '*',
  cors({
    origin: (origin) => (origin && allowedOrigins.includes(origin) ? origin : undefined),
    allowHeaders: ['Content-Type', 'x-admin-key'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400
  })
);

app.options('*', (c) => c.body(null, 204));

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  if (c.req.path.startsWith('/webhooks/stripe')) return next();
  if (c.req.path.startsWith('/stripe/webhook')) return next();
  if (c.req.path.startsWith('/checkout/session')) return next();
  if (c.req.method === 'GET' && c.req.path === '/dev/ping') return next();
  if (
    c.req.method === 'GET' &&
    (c.req.path === '/store' || c.req.path.startsWith('/store/'))
  ) {
    return next();
  }
  const key = c.req.header('x-admin-key') || (c.req.path === '/r2' ? c.req.query('x-admin-key') : undefined);
  if (!key || key !== c.env.ADMIN_API_KEY) return jsonError(c, 'Unauthorized', 401);
  await next();
});

app.get('/', (c) => jsonOk(c, { message: 'led kikaku os api' }));

app.route('/reports', reports);
app.route('/', accounting);
app.route('/', inbox);
app.route('/', dailyCloseArtifacts);
app.route('/dev', dev);
app.route('/', inventory);
app.route('/ai', ai);
app.route('/', adminOrders);
app.route('/admin', adminProducts);
app.route('/admin', adminReports);
app.route('/admin', adminStripeEvents);
app.route('/admin', adminCustomers);
app.route('/admin', adminCoupons);
app.route('/', fulfillments);
app.route('/', stripe);
app.route('/', checkout);
app.route('/store', storefront);

app.get('/r2', async (c) => {
  const key = c.req.query('key');
  if (!key) return jsonError(c, 'key required', 400);
  try {
    const obj = await c.env.R2.get(key);
    if (!obj) return jsonError(c, 'not found', 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('cache-control', 'private, max-age=60');
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

    console.log(`Daily close completed for ${date}: runId=${runId}, ledgerEntries=${journalResult.entriesCreated}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await completeDailyCloseRun(env, runId, {
      status: 'failed',
      errorMessage
    });
    console.error(`Daily close failed for ${date}: runId=${runId}`, err);
    throw err;
  }
};

const runAnomalyChecks = async (env: Env['Bindings'], date: string) => {
  try {
    const result = await runAllAnomalyChecks(env, date);
    console.log(`Anomaly checks completed for ${date}:`, {
      lowStock: result.lowStock.filter((r) => r.created).length,
      negativeStock: result.negativeStock.filter((r) => r.created).length,
      highRefundRate: result.highRefundRate?.created ?? false,
      webhookFailures: result.webhookFailures?.created ?? false,
      unfulfilledOrders: result.unfulfilledOrders?.created ?? false
    });
  } catch (err) {
    console.error('Anomaly check failed:', err);
  }
};

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env['Bindings'], ctx: ExecutionContext) => {
    const date = buildJstYesterday();
    ctx.waitUntil(runDailyCloseArtifacts(env, date));
    ctx.waitUntil(runAnomalyChecks(env, date));
  }
};
