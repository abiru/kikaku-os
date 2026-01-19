import { Hono } from 'hono';
import { ensureDate } from '../lib/date';
import { jsonError, jsonOk } from '../lib/http';
import { generateDailyReport } from '../services/dailyReport';
import { generateStripeEvidence } from '../services/stripeEvidence';
import { renderDailyCloseHtml } from '../services/renderDailyCloseHtml';
import { putJson, putText } from '../lib/r2';
import { journalizeDailyClose } from '../services/journalize';
import { enqueueDailyCloseAnomaly } from '../services/inboxAnomalies';
import { listDocuments, upsertDocument } from '../services/documents';
import {
  startDailyCloseRun,
  completeDailyCloseRun,
  getLatestRunForDate,
  listDailyCloseRuns,
  type DailyCloseRunResult
} from '../services/dailyCloseRuns';
import type { Env } from '../env';

const dailyCloseArtifacts = new Hono<Env>();

const baseKey = (date: string) => `daily-close/${date}`;

// Helper to run daily close for a single date
const runDailyCloseForDate = async (
  env: Env['Bindings'],
  date: string,
  force: boolean = false
): Promise<DailyCloseRunResult> => {
  const runId = await startDailyCloseRun(env, date, force);

  try {
    const report = await generateDailyReport(env, date);
    const evidence = await generateStripeEvidence(env, date);
    const html = renderDailyCloseHtml(report, evidence);

    const reportKey = `${baseKey(date)}/report.json`;
    const evidenceKey = `${baseKey(date)}/stripe-evidence.json`;
    const htmlKey = `${baseKey(date)}/report.html`;

    await putJson(env.R2, reportKey, report);
    await putJson(env.R2, evidenceKey, evidence);
    await putText(env.R2, htmlKey, html, 'text/html; charset=utf-8');

    await upsertDocument(env, 'daily_close', date, reportKey, 'application/json');
    await upsertDocument(env, 'daily_close', date, evidenceKey, 'application/json');
    await upsertDocument(env, 'daily_close', date, htmlKey, 'text/html');

    const journalResult = await journalizeDailyClose(env, date, report, { force });
    const anomalyCreated = await enqueueDailyCloseAnomaly(env, report, { reportKey, htmlKey });

    await completeDailyCloseRun(env, runId, {
      status: 'success',
      artifactsGenerated: 3,
      ledgerEntriesCreated: journalResult.entriesCreated,
      anomalyDetected: anomalyCreated
    });

    return {
      runId,
      date,
      status: 'success',
      artifactsGenerated: 3,
      ledgerEntriesCreated: journalResult.entriesCreated,
      anomalyDetected: anomalyCreated,
      forced: force
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await completeDailyCloseRun(env, runId, {
      status: 'failed',
      errorMessage
    });

    return {
      runId,
      date,
      status: 'failed',
      artifactsGenerated: 0,
      ledgerEntriesCreated: 0,
      anomalyDetected: false,
      forced: force,
      errorMessage
    };
  }
};

dailyCloseArtifacts.post('/daily-close/:date/artifacts', async (c) => {
  const date = ensureDate(c.req.param('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);

  const force = c.req.query('force') === 'true';

  try {
    const result = await runDailyCloseForDate(c.env, date, force);

    if (result.status === 'failed') {
      return jsonError(c, result.errorMessage || 'Failed to create artifacts');
    }

    return jsonOk(c, {
      date,
      runId: result.runId,
      keys: {
        reportKey: `${baseKey(date)}/report.json`,
        evidenceKey: `${baseKey(date)}/stripe-evidence.json`,
        htmlKey: `${baseKey(date)}/report.html`
      },
      ledgerEntriesCreated: result.ledgerEntriesCreated,
      anomalyDetected: result.anomalyDetected,
      forced: result.forced
    });
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

// Get status of daily close run for a date
dailyCloseArtifacts.get('/daily-close/:date/status', async (c) => {
  const date = ensureDate(c.req.param('date') || '');
  if (!date) return jsonError(c, 'Invalid date', 400);

  try {
    const run = await getLatestRunForDate(c.env, date);
    return jsonOk(c, { date, run });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch run status');
  }
});

// List all daily close runs
dailyCloseArtifacts.get('/daily-close/runs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  try {
    const runs = await listDailyCloseRuns(c.env, { limit, offset });
    return jsonOk(c, { runs });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch runs');
  }
});

// Backfill daily close for a date range
dailyCloseArtifacts.post('/daily-close/backfill', async (c) => {
  const body = await c.req.json<{
    startDate: string;
    endDate: string;
    force?: boolean;
    skipExisting?: boolean;
  }>();

  const startDate = ensureDate(body.startDate);
  const endDate = ensureDate(body.endDate);

  if (!startDate || !endDate) {
    return jsonError(c, 'Invalid startDate or endDate', 400);
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return jsonError(c, 'startDate must be before or equal to endDate', 400);
  }

  // Limit to 90 days to prevent timeout
  const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 90) {
    return jsonError(c, 'Date range cannot exceed 90 days', 400);
  }

  const force = body.force === true;
  const skipExisting = body.skipExisting !== false; // default true

  const results: DailyCloseRunResult[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);

    // Check if we should skip this date
    if (skipExisting && !force) {
      const existingRun = await getLatestRunForDate(c.env, dateStr);
      if (existingRun?.status === 'success') {
        results.push({
          runId: existingRun.id,
          date: dateStr,
          status: 'success',
          artifactsGenerated: existingRun.artifacts_generated,
          ledgerEntriesCreated: existingRun.ledger_entries_created,
          anomalyDetected: existingRun.anomaly_detected === 1,
          forced: false
        });
        current.setDate(current.getDate() + 1);
        continue;
      }
    }

    const result = await runDailyCloseForDate(c.env, dateStr, force);
    results.push(result);

    current.setDate(current.getDate() + 1);
  }

  const summary = {
    total: results.length,
    success: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'success' && !r.forced && r.ledgerEntriesCreated === 0).length
  };

  return jsonOk(c, { summary, results });
});

export default dailyCloseArtifacts;
