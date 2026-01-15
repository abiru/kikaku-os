import { Hono } from 'hono';
import { ensureDate } from '../lib/date';
import { jsonError, jsonOk } from '../lib/http';
import { generateDailyReport } from '../services/dailyReport';
import { generateStripeEvidence } from '../services/stripeEvidence';
import { renderDailyCloseHtml } from '../services/renderDailyCloseHtml';
import { putJson, putText } from '../lib/r2';
import { journalizeDailyClose } from '../services/journalize';
import { listDocuments, upsertDocument } from '../services/documents';
import type { Env } from '../env';

const dailyCloseArtifacts = new Hono<Env>();

const baseKey = (date: string) => `daily-close/${date}`;

dailyCloseArtifacts.post('/daily-close/:date/artifacts', async (c) => {
  const date = ensureDate(c.req.param('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);
  try {
    const report = await generateDailyReport(c.env, date);
    const evidence = await generateStripeEvidence(c.env, date);
    const html = renderDailyCloseHtml(report, evidence);

    const reportKey = `${baseKey(date)}/report.json`;
    const evidenceKey = `${baseKey(date)}/stripe-evidence.json`;
    const htmlKey = `${baseKey(date)}/report.html`;

    await putJson(c.env.R2, reportKey, report);
    await putJson(c.env.R2, evidenceKey, evidence);
    await putText(c.env.R2, htmlKey, html, 'text/html');

    await upsertDocument(c.env, 'daily_close', date, reportKey, 'application/json');
    await upsertDocument(c.env, 'daily_close', date, evidenceKey, 'application/json');
    await upsertDocument(c.env, 'daily_close', date, htmlKey, 'text/html');

    await journalizeDailyClose(c.env, date, report);

    return jsonOk(c, { date, keys: { reportKey, evidenceKey, htmlKey } });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to create artifacts');
  }
});

dailyCloseArtifacts.get('/daily-close/:date/documents', async (c) => {
  const date = ensureDate(c.req.param('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);
  try {
    const documents = await listDocuments(c.env, 'daily_close', date);
    return jsonOk(c, { documents });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch documents');
  }
});

export default dailyCloseArtifacts;
