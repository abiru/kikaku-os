import type { Env } from '../env';

export type DailyCloseRunStatus = 'pending' | 'running' | 'success' | 'failed';

export type DailyCloseRun = {
  id: number;
  date: string;
  status: DailyCloseRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  artifacts_generated: number;
  ledger_entries_created: number;
  anomaly_detected: number;
  forced: number;
  created_at: string;
  updated_at: string;
};

export type DailyCloseRunResult = {
  runId: number;
  date: string;
  status: DailyCloseRunStatus;
  artifactsGenerated: number;
  ledgerEntriesCreated: number;
  anomalyDetected: boolean;
  forced: boolean;
  errorMessage?: string;
};

export const startDailyCloseRun = async (
  env: Env['Bindings'],
  date: string,
  forced: boolean = false
): Promise<number> => {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO daily_close_runs (date, status, started_at, forced, updated_at)
     VALUES (?, 'running', ?, ?, datetime('now'))
     RETURNING id`
  ).bind(date, now, forced ? 1 : 0).first<{ id: number }>();
  return result?.id || 0;
};

export const completeDailyCloseRun = async (
  env: Env['Bindings'],
  runId: number,
  result: {
    status: 'success' | 'failed';
    artifactsGenerated?: number;
    ledgerEntriesCreated?: number;
    anomalyDetected?: boolean;
    errorMessage?: string;
  }
): Promise<void> => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE daily_close_runs
     SET status = ?,
         completed_at = ?,
         artifacts_generated = ?,
         ledger_entries_created = ?,
         anomaly_detected = ?,
         error_message = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    result.status,
    now,
    result.artifactsGenerated ?? 0,
    result.ledgerEntriesCreated ?? 0,
    result.anomalyDetected ? 1 : 0,
    result.errorMessage ?? null,
    runId
  ).run();
};

export const getLatestRunForDate = async (
  env: Env['Bindings'],
  date: string
): Promise<DailyCloseRun | null> => {
  const row = await env.DB.prepare(
    `SELECT * FROM daily_close_runs WHERE date = ? ORDER BY started_at DESC LIMIT 1`
  ).bind(date).first<DailyCloseRun>();
  return row || null;
};

export const listDailyCloseRuns = async (
  env: Env['Bindings'],
  options?: { limit?: number; offset?: number; status?: DailyCloseRunStatus }
): Promise<DailyCloseRun[]> => {
  let query = 'SELECT * FROM daily_close_runs';
  const params: (string | number)[] = [];

  if (options?.status) {
    query += ' WHERE status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY started_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  let stmt = env.DB.prepare(query);
  for (let i = 0; i < params.length; i++) {
    stmt = stmt.bind(params[i]);
  }

  const result = await stmt.all<DailyCloseRun>();
  return result.results || [];
};

export const hasSuccessfulRunForDate = async (
  env: Env['Bindings'],
  date: string
): Promise<boolean> => {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM daily_close_runs WHERE date = ? AND status = 'success'`
  ).bind(date).first<{ cnt: number }>();
  return (row?.cnt || 0) > 0;
};
