import { Env } from '../env';
import { DailyReport } from './dailyReport';

export const journalizeDailyClose = async (env: Env['Bindings'], date: string, report: DailyReport) => {
  const existing = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM ledger_entries WHERE ref_type='daily_close' AND ref_id=?`
  ).bind(date).first<{ cnt: number }>();
  if ((existing?.cnt || 0) > 0) return;

  const paymentsTotal = report.payments.totalAmount;
  const feeTotal = report.payments.totalFee;
  const refundTotal = report.refunds.totalAmount;
  const net = paymentsTotal - feeTotal;

  const entries = [
    { account: 'acct_bank', debit: net, credit: 0, memo: 'Daily close net' },
    { account: 'acct_sales', debit: 0, credit: net, memo: 'Daily close net' }
  ];

  if (feeTotal > 0) {
    entries.push({ account: 'acct_fee', debit: feeTotal, credit: 0, memo: 'Payment fees' });
    entries.push({ account: 'acct_sales', debit: 0, credit: feeTotal, memo: 'Payment fees' });
  }

  if (refundTotal > 0) {
    entries.push({ account: 'acct_refund', debit: refundTotal, credit: 0, memo: 'Refunds' });
    entries.push({ account: 'acct_bank', debit: 0, credit: refundTotal, memo: 'Refunds' });
  }

  const stmt = env.DB.prepare(
    `INSERT INTO ledger_entries (ref_type, ref_id, account_id, debit, credit, memo) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const e of entries) {
    await stmt.bind('daily_close', date, e.account, e.debit, e.credit, e.memo).run();
  }
};

export const listLedgerEntries = async (env: Env['Bindings'], date: string) => {
  const res = await env.DB.prepare(
    `SELECT id, account_id, debit, credit, memo FROM ledger_entries WHERE ref_type='daily_close' AND ref_id=?`
  ).bind(date).all<{ id: number; account_id: string; debit: number; credit: number; memo: string | null }>();
  return res.results || [];
};
