import { describe, it, expect, vi, beforeEach } from 'vitest';
import { journalizeDailyClose, type JournalizeResult } from '../../../services/journalize';
import type { DailyReport } from '../../../services/dailyReport';

const createMockReport = (overrides?: Partial<DailyReport>): DailyReport => ({
  date: '2025-01-15',
  orders: { count: 2, totalNet: 25000, totalFee: 750 },
  payments: { count: 2, totalAmount: 25000, totalFee: 750 },
  refunds: { count: 0, totalAmount: 0 },
  anomalies: { level: 'ok', diff: 0, message: '' },
  ...overrides
});

const createMockDB = (existingCount: number = 0) => {
  const insertedEntries: any[] = [];

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('SELECT COUNT(*)')) {
            return { cnt: existingCount };
          }
          return null;
        }),
        run: vi.fn(async () => {
          if (sql.includes('INSERT') && sql.includes('ledger_entries')) {
            insertedEntries.push({
              ref_type: args[0],
              ref_id: args[1],
              account_id: args[2],
              debit: args[3],
              credit: args[4],
              memo: args[5]
            });
          }
          return { success: true, meta: { changes: 1 } };
        })
      }))
    })),
    getInsertedEntries: () => insertedEntries
  };
};

describe('journalizeDailyClose', () => {
  describe('when no existing entries', () => {
    it('creates ledger entries for net sales', async () => {
      const mockDB = createMockDB(0);
      const env = { DB: mockDB };
      const report = createMockReport();

      const result = await journalizeDailyClose(env as any, '2025-01-15', report);

      expect(result.skipped).toBe(false);
      expect(result.entriesCreated).toBeGreaterThan(0);
    });

    it('creates entries for payment fees when present', async () => {
      const mockDB = createMockDB(0);
      const env = { DB: mockDB };
      const report = createMockReport({
        payments: { count: 1, totalAmount: 10000, totalFee: 300 }
      });

      const result = await journalizeDailyClose(env as any, '2025-01-15', report);

      expect(result.entriesCreated).toBe(4); // 2 for net + 2 for fees
    });

    it('creates entries for refunds when present', async () => {
      const mockDB = createMockDB(0);
      const env = { DB: mockDB };
      const report = createMockReport({
        refunds: { count: 1, totalAmount: 5000 }
      });

      const result = await journalizeDailyClose(env as any, '2025-01-15', report);

      expect(result.entriesCreated).toBe(6); // 2 net + 2 fees + 2 refunds
    });
  });

  describe('when existing entries exist', () => {
    it('skips without force option', async () => {
      const mockDB = createMockDB(4);
      const env = { DB: mockDB };
      const report = createMockReport();

      const result = await journalizeDailyClose(env as any, '2025-01-15', report);

      expect(result.skipped).toBe(true);
      expect(result.entriesCreated).toBe(0);
    });

    it('deletes and recreates with force option', async () => {
      const deleteCalled = { value: false };
      const mockDB = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((..._args: any[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('SELECT COUNT(*)')) {
                return { cnt: 4 };
              }
              return null;
            }),
            run: vi.fn(async () => {
              if (sql.includes('DELETE FROM ledger_entries')) {
                deleteCalled.value = true;
              }
              return { success: true, meta: { changes: 1 } };
            })
          }))
        }))
      };
      const env = { DB: mockDB };
      const report = createMockReport();

      const result = await journalizeDailyClose(env as any, '2025-01-15', report, { force: true });

      expect(deleteCalled.value).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.entriesCreated).toBeGreaterThan(0);
    });
  });
});
