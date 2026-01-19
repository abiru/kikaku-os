import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startDailyCloseRun,
  completeDailyCloseRun,
  getLatestRunForDate,
  hasSuccessfulRunForDate
} from './dailyCloseRuns';

const createMockDB = () => {
  let lastInsertedId = 0;
  const rows: Record<string, any>[] = [];

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('INSERT INTO daily_close_runs')) {
            lastInsertedId++;
            rows.push({
              id: lastInsertedId,
              date: args[0],
              status: 'running',
              started_at: args[1],
              forced: args[2]
            });
            return { id: lastInsertedId };
          }
          if (sql.includes('SELECT * FROM daily_close_runs WHERE date')) {
            const found = rows.find((r) => r.date === args[0]);
            return found || null;
          }
          if (sql.includes('SELECT COUNT(*) as cnt')) {
            const count = rows.filter((r) => r.date === args[0] && r.status === 'success').length;
            return { cnt: count };
          }
          return null;
        }),
        run: vi.fn(async () => {
          if (sql.includes('UPDATE daily_close_runs')) {
            const runId = args[args.length - 1];
            const row = rows.find((r) => r.id === runId);
            if (row) {
              row.status = args[0];
              row.completed_at = args[1];
              row.artifacts_generated = args[2];
              row.ledger_entries_created = args[3];
              row.anomaly_detected = args[4];
              row.error_message = args[5];
            }
          }
          return { success: true };
        }),
        all: vi.fn(async () => ({ results: rows }))
      }))
    }))
  };
};

describe('dailyCloseRuns', () => {
  let mockDB: ReturnType<typeof createMockDB>;
  let env: { DB: ReturnType<typeof createMockDB> };

  beforeEach(() => {
    mockDB = createMockDB();
    env = { DB: mockDB };
  });

  describe('startDailyCloseRun', () => {
    it('creates a new run record with running status', async () => {
      const runId = await startDailyCloseRun(env as any, '2025-01-15', false);

      expect(runId).toBe(1);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO daily_close_runs')
      );
    });

    it('sets forced flag when force is true', async () => {
      const runId = await startDailyCloseRun(env as any, '2025-01-15', true);

      expect(runId).toBe(1);
    });
  });

  describe('completeDailyCloseRun', () => {
    it('updates run with success status', async () => {
      const runId = await startDailyCloseRun(env as any, '2025-01-15', false);

      await completeDailyCloseRun(env as any, runId, {
        status: 'success',
        artifactsGenerated: 3,
        ledgerEntriesCreated: 4,
        anomalyDetected: true
      });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE daily_close_runs')
      );
    });

    it('updates run with failed status and error message', async () => {
      const runId = await startDailyCloseRun(env as any, '2025-01-15', false);

      await completeDailyCloseRun(env as any, runId, {
        status: 'failed',
        errorMessage: 'Something went wrong'
      });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE daily_close_runs')
      );
    });
  });

  describe('getLatestRunForDate', () => {
    it('returns null when no run exists', async () => {
      const run = await getLatestRunForDate(env as any, '2025-01-15');
      expect(run).toBeNull();
    });

    it('returns the run when it exists', async () => {
      await startDailyCloseRun(env as any, '2025-01-15', false);
      const run = await getLatestRunForDate(env as any, '2025-01-15');

      expect(run).toBeDefined();
      expect(run?.date).toBe('2025-01-15');
    });
  });

  describe('hasSuccessfulRunForDate', () => {
    it('returns false when no successful run exists', async () => {
      const result = await hasSuccessfulRunForDate(env as any, '2025-01-15');
      expect(result).toBe(false);
    });

    it('returns true when a successful run exists', async () => {
      const runId = await startDailyCloseRun(env as any, '2025-01-15', false);
      await completeDailyCloseRun(env as any, runId, { status: 'success' });

      const result = await hasSuccessfulRunForDate(env as any, '2025-01-15');
      expect(result).toBe(true);
    });
  });
});
