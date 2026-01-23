import { describe, it, expect } from 'vitest';
import { enqueueDailyCloseAnomaly } from '../../services/inboxAnomalies';
import type { DailyReport } from '../../services/dailyReport';

const buildReport = (level: DailyReport['anomalies']['level']): DailyReport => ({
  date: '2026-01-15',
  orders: { count: 1, totalNet: 1000, totalFee: 0 },
  payments: { count: 1, totalAmount: 2000, totalFee: 0 },
  refunds: { count: 0, totalAmount: 0 },
  anomalies: { level, diff: 1000, message: 'x' }
});

const createMockDb = () => {
  const store = new Map<string, number>();
  return {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => {
        if (sql.startsWith('INSERT INTO inbox_items')) {
          const key = `${args[3]}::${args[4]}`;
          return {
            run: async () => {
              if (store.has(key)) {
                throw new Error('UNIQUE constraint failed: inbox_items.kind, inbox_items.date');
              }
              store.set(key, 1);
            }
          };
        }
        return { run: async () => {}, first: async () => null };
      }
    })
  };
};

const createEnv = () => ({
  DB: createMockDb()
}) as any;

describe('enqueueDailyCloseAnomaly', () => {
  it('does not enqueue when level is ok', async () => {
    const env = createEnv();
    const report = buildReport('ok');
    const created = await enqueueDailyCloseAnomaly(env, report, {
      reportKey: 'report',
      htmlKey: 'html'
    });
    expect(created).toBe(false);
  });

  it('enqueues when level is warning/critical', async () => {
    const env = createEnv();
    const report = buildReport('warning');
    const created = await enqueueDailyCloseAnomaly(env, report, {
      reportKey: 'report',
      htmlKey: 'html'
    });
    expect(created).toBe(true);
  });

  it('does not enqueue duplicates for same date/kind', async () => {
    const env = createEnv();
    const report = buildReport('critical');
    const first = await enqueueDailyCloseAnomaly(env, report, {
      reportKey: 'report',
      htmlKey: 'html'
    });
    const second = await enqueueDailyCloseAnomaly(env, report, {
      reportKey: 'report',
      htmlKey: 'html'
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
