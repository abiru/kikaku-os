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
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400
  })
);

app.options('*', (c) => c.text('', 204));

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  if (c.req.path.startsWith('/webhooks/stripe')) return next();
  if (c.req.path.startsWith('/checkout/session')) return next();
  if (c.req.path.startsWith('/store/products')) return next();
  const key = c.req.header('x-admin-key');
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

  await journalizeDailyClose(env, date, report);
  await enqueueDailyCloseAnomaly(env, report, {
    reportKey,
    htmlKey
  });
};

const runInventoryCheck = async (env: Env['Bindings']) => {
  const res = await env.DB.prepare(
    `SELECT t.variant_id as variant_id,
            COALESCE(SUM(m.delta), 0) as on_hand,
            t.threshold as threshold
     FROM inventory_thresholds t
     LEFT JOIN inventory_movements m ON m.variant_id = t.variant_id
     GROUP BY t.variant_id
     HAVING on_hand < t.threshold`
  ).all<{ variant_id: number; on_hand: number; threshold: number }>();

  for (const row of res.results || []) {
    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, created_at, updated_at)
       VALUES (?, ?, 'warning', 'open', datetime('now'), datetime('now'))`
    ).bind(
      'Low stock',
      `variant_id=${row.variant_id} on_hand=${row.on_hand} threshold=${row.threshold}`
    ).run();
  }
};

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env['Bindings'], ctx: ExecutionContext) => {
    const date = buildJstYesterday();
    ctx.waitUntil(runDailyCloseArtifacts(env, date));
    ctx.waitUntil(runInventoryCheck(env));
  }
};
