import { Env } from '../env';
import { DailyReport } from './dailyReport';

export type JournalizeResult = {
  entriesCreated: number;
  skipped: boolean;
};

export const journalizeDailyClose = async (
  env: Env['Bindings'],
  date: string,
  report: DailyReport,
  options?: { force?: boolean }
): Promise<JournalizeResult> => {
  const existing = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM ledger_entries WHERE ref_type='daily_close' AND ref_id=?`
  ).bind(date).first<{ cnt: number }>();

  const hasExisting = (existing?.cnt || 0) > 0;

  if (hasExisting && !options?.force) {
    return { entriesCreated: 0, skipped: true };
  }

  // Force mode: delete existing entries first
  if (hasExisting && options?.force) {
    await env.DB.prepare(
      `DELETE FROM ledger_entries WHERE ref_type='daily_close' AND ref_id=?`
    ).bind(date).run();
  }

  const paymentsTotal = report.payments.totalAmount;
  const feeTotal = report.payments.totalFee;
  const refundTotal = report.refunds.totalAmount;
  const net = paymentsTotal - feeTotal;

  // Query tax total from paid orders for the date (消費税仮受)
  const taxRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(tax_amount), 0) as taxTotal
     FROM orders WHERE status IN ('paid','fulfilled','partially_refunded') AND substr(paid_at,1,10)=?`
  ).bind(date).first<{ taxTotal: number }>();
  const taxTotal = taxRow?.taxTotal || 0;

  // Sales amount is net minus tax (税抜売上)
  const salesExTax = net - taxTotal;

  const entries = [
    { account: 'acct_bank', debit: net, credit: 0, memo: 'Daily close net' },
    { account: 'acct_sales', debit: 0, credit: salesExTax, memo: 'Daily close sales (税抜)' }
  ];

  // Separate tax payable entry (仮受消費税)
  if (taxTotal > 0) {
    entries.push({ account: 'acct_tax_payable', debit: 0, credit: taxTotal, memo: '消費税仮受' });
  }

  if (feeTotal > 0) {
    entries.push({ account: 'acct_fee', debit: feeTotal, credit: 0, memo: 'Payment fees' });
    entries.push({ account: 'acct_sales', debit: 0, credit: feeTotal, memo: 'Payment fees' });
  }

  if (refundTotal > 0) {
    entries.push({ account: 'acct_refund', debit: refundTotal, credit: 0, memo: 'Refunds' });
    entries.push({ account: 'acct_bank', debit: 0, credit: refundTotal, memo: 'Refunds' });
  }

  // Use INSERT OR IGNORE to handle race conditions gracefully
  // If entries already exist (from concurrent run), they will be skipped
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO ledger_entries (ref_type, ref_id, account_id, debit, credit, memo) VALUES (?, ?, ?, ?, ?, ?)`
  );
  let inserted = 0;
  for (const e of entries) {
    const result = await stmt.bind('daily_close', date, e.account, e.debit, e.credit, e.memo).run();
    if (result.meta.changes > 0) inserted++;
  }

  // Return actual number of entries created (may be less if some already existed)
  return { entriesCreated: inserted, skipped: inserted === 0 && entries.length > 0 };
};

export const listLedgerEntries = async (env: Env['Bindings'], date: string) => {
  const res = await env.DB.prepare(
    `SELECT id, account_id, debit, credit, memo FROM ledger_entries WHERE ref_type='daily_close' AND ref_id=?`
  ).bind(date).all<{ id: number; account_id: string; debit: number; credit: number; memo: string | null }>();
  return res.results || [];
};
