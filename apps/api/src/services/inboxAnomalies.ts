import type { DailyReport } from './dailyReport';

type DailyCloseKeys = {
  reportKey: string;
  htmlKey: string;
};

const levelLabel = (level: DailyReport['anomalies']['level']) => {
  if (level === 'critical') return 'CRIT';
  if (level === 'warning') return 'WARN';
  return 'OK';
};

const severityForLevel = (level: DailyReport['anomalies']['level']) => {
  if (level === 'critical') return 'critical';
  if (level === 'warning') return 'warning';
  return 'info';
};

type Bindings = {
  DB: D1Database;
};

export const enqueueDailyCloseAnomaly = async (
  env: Bindings,
  report: DailyReport,
  keys: DailyCloseKeys
) => {
  if (report.anomalies.level === 'ok') return false;

  const kind = 'daily_close_anomaly';
  const date = report.date;

  const body = JSON.stringify({
    date,
    level: report.anomalies.level,
    diff: report.anomalies.diff,
    orders: report.orders,
    payments: report.payments,
    refunds: report.refunds,
    reportKey: keys.reportKey,
    htmlKey: keys.htmlKey
  });

  try {
    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, date, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      `Daily Close ${levelLabel(report.anomalies.level)} ${date}`,
      body,
      severityForLevel(report.anomalies.level),
      kind,
      date
    ).run();
    return true;
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) return false;
    throw err;
  }
};
