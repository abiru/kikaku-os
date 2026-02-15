import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import accounting from '../../../routes/accounting/accounting';

vi.mock('../../../services/journalize', () => ({
  listLedgerEntries: vi.fn(),
}));

import { listLedgerEntries } from '../../../services/journalize';

const createApp = () => {
  const app = new Hono();
  app.route('/', accounting);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: {},
      } as any),
  };
};

describe('Accounting Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /ledger-entries', () => {
    it('returns ledger entries for a valid date', async () => {
      const entries = [
        { id: 1, account_id: 'acct_bank', debit: 10000, credit: 0, memo: 'Daily close net' },
        { id: 2, account_id: 'acct_sales', debit: 0, credit: 9091, memo: 'Daily close sales (税抜)' },
        { id: 3, account_id: 'acct_tax_payable', debit: 0, credit: 909, memo: '消費税仮受' },
      ];

      (listLedgerEntries as any).mockResolvedValueOnce(entries);

      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2026-01-13');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.entries).toHaveLength(3);
      expect(data.entries[0].account_id).toBe('acct_bank');
      expect(data.entries[0].debit).toBe(10000);
    });

    it('returns 400 for missing date parameter', async () => {
      const { fetch } = createApp();

      const res = await fetch('/ledger-entries');

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Invalid date');
    });

    it('returns 400 for invalid date format', async () => {
      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2026/01/13');

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Invalid date');
    });

    it('returns 400 for partial date', async () => {
      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2026-01');

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('returns empty array when no entries exist', async () => {
      (listLedgerEntries as any).mockResolvedValueOnce([]);

      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2020-01-01');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.entries).toHaveLength(0);
    });

    it('returns 500 on service failure', async () => {
      (listLedgerEntries as any).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2026-01-13');

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Failed to fetch ledger entries');
    });

    it('includes all entry fields in response', async () => {
      const entries = [
        { id: 1, account_id: 'acct_fee', debit: 300, credit: 0, memo: 'Payment fees' },
      ];

      (listLedgerEntries as any).mockResolvedValueOnce(entries);

      const { fetch } = createApp();

      const res = await fetch('/ledger-entries?date=2026-01-13');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      const entry = data.entries[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('account_id');
      expect(entry).toHaveProperty('debit');
      expect(entry).toHaveProperty('credit');
      expect(entry).toHaveProperty('memo');
    });
  });
});
