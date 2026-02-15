import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import accounting from '../../../routes/accounting/accounting';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockListLedgerEntries = vi.fn();

vi.mock('../../../services/journalize', () => ({
  listLedgerEntries: (...args: unknown[]) => mockListLedgerEntries(...args),
}));

const ADMIN_KEY = 'test-admin-key';

const createApp = () => {
  const app = new Hono();
  app.route('/', accounting);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: {}, R2: {}, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Accounting API', () => {
  describe('GET /ledger-entries', () => {
    it('returns entries for valid date', async () => {
      const entries = [
        { id: 1, account_id: 'sales', debit: 0, credit: 5000, memo: 'Daily close' },
        { id: 2, account_id: 'cash', debit: 5000, credit: 0, memo: 'Daily close' },
      ];
      mockListLedgerEntries.mockResolvedValueOnce(entries);

      const { fetch } = createApp();
      const res = await fetch('/ledger-entries?date=2026-01-15');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.entries).toHaveLength(2);
      expect(json.entries[0].account_id).toBe('sales');
      expect(json.entries[1].debit).toBe(5000);
    });

    it('returns 400 for missing date parameter', async () => {
      const { fetch } = createApp();
      const res = await fetch('/ledger-entries');
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date');
    });

    it('returns empty array when no entries exist', async () => {
      mockListLedgerEntries.mockResolvedValueOnce([]);

      const { fetch } = createApp();
      const res = await fetch('/ledger-entries?date=2026-01-15');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.entries).toHaveLength(0);
    });

    it('returns 400 for invalid date format', async () => {
      const { fetch } = createApp();
      const res = await fetch('/ledger-entries?date=not-a-date');
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date');
    });

    it('returns 400 for partial date format', async () => {
      const { fetch } = createApp();
      const res = await fetch('/ledger-entries?date=2026-01');
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 500 when service throws', async () => {
      mockListLedgerEntries.mockRejectedValueOnce(new Error('DB error'));

      const { fetch } = createApp();
      const res = await fetch('/ledger-entries?date=2026-01-15');
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch ledger entries');
    });
  });
});
