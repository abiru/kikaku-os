import { describe, it, expect, vi } from 'vitest';
import { generateDailyReport } from '../../services/dailyReport';
import type { Env } from '../../env';

const createMockEnv = (overrides?: {
  ordersRow?: Record<string, number> | null;
  paymentsRow?: Record<string, number> | null;
  refundsRow?: Record<string, number> | null;
}): Env['Bindings'] => {
  const ordersRow = overrides?.ordersRow !== undefined
    ? overrides.ordersRow
    : { count: 0, totalNet: 0, totalFee: 0 };
  const paymentsRow = overrides?.paymentsRow !== undefined
    ? overrides.paymentsRow
    : { count: 0, totalAmount: 0, totalFee: 0 };
  const refundsRow = overrides?.refundsRow !== undefined
    ? overrides.refundsRow
    : { count: 0, totalAmount: 0 };

  let callIndex = 0;
  const results = [ordersRow, paymentsRow, refundsRow];

  const mockFirst = vi.fn(() => Promise.resolve(results[callIndex++]));
  const mockBind = vi.fn(() => ({ first: mockFirst }));
  const mockPrepare = vi.fn(() => ({ bind: mockBind }));

  return {
    DB: { prepare: mockPrepare } as unknown as D1Database,
  } as unknown as Env['Bindings'];
};

describe('dailyReport service', () => {
  describe('generateDailyReport', () => {
    it('should return zero values for empty database', async () => {
      const env = createMockEnv();

      const report = await generateDailyReport(env, '2026-01-15');

      expect(report).toEqual({
        date: '2026-01-15',
        orders: { count: 0, totalNet: 0, totalFee: 0 },
        payments: { count: 0, totalAmount: 0, totalFee: 0 },
        refunds: { count: 0, totalAmount: 0 },
        anomalies: { level: 'ok', diff: 0, message: 'OK diff: 0' },
      });
    });

    it('should aggregate orders, payments, and refunds', async () => {
      const env = createMockEnv({
        ordersRow: { count: 5, totalNet: 50000, totalFee: 2500 },
        paymentsRow: { count: 5, totalAmount: 50000, totalFee: 1500 },
        refundsRow: { count: 1, totalAmount: 3000 },
      });

      const report = await generateDailyReport(env, '2026-02-01');

      expect(report.date).toBe('2026-02-01');
      expect(report.orders).toEqual({ count: 5, totalNet: 50000, totalFee: 2500 });
      expect(report.payments).toEqual({ count: 5, totalAmount: 50000, totalFee: 1500 });
      expect(report.refunds).toEqual({ count: 1, totalAmount: 3000 });
    });

    it('should pass the date parameter to all three queries', async () => {
      const env = createMockEnv();
      const db = env.DB as unknown as { prepare: ReturnType<typeof vi.fn> };

      await generateDailyReport(env, '2026-03-15');

      expect(db.prepare).toHaveBeenCalledTimes(3);
      const bindCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.results.map(
        (r: { value: { bind: ReturnType<typeof vi.fn> } }) => r.value.bind
      );
      for (const bind of bindCalls) {
        expect(bind).toHaveBeenCalledWith('2026-03-15');
      }
    });

    // ----- Anomaly detection threshold tests -----

    describe('anomaly thresholds', () => {
      it('should return "ok" when diff is 0', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 10000, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('ok');
        expect(report.anomalies.diff).toBe(0);
      });

      it('should return "ok" when diff is 999 (below warning threshold)', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 10999, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('ok');
        expect(report.anomalies.diff).toBe(999);
      });

      it('should return "ok" when diff is 1000 (at warning threshold boundary)', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 11000, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('ok');
        expect(report.anomalies.diff).toBe(1000);
      });

      it('should return "warning" when diff is 1001 (just above warning threshold)', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 11001, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('warning');
        expect(report.anomalies.diff).toBe(1001);
      });

      it('should return "warning" when diff is 9999', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 19999, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('warning');
        expect(report.anomalies.diff).toBe(9999);
      });

      it('should return "warning" when diff is 10000 (at critical threshold boundary)', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 20000, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('warning');
        expect(report.anomalies.diff).toBe(10000);
      });

      it('should return "critical" when diff is 10001 (just above critical threshold)', async () => {
        const env = createMockEnv({
          ordersRow: { count: 1, totalNet: 10000, totalFee: 0 },
          paymentsRow: { count: 1, totalAmount: 20001, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('critical');
        expect(report.anomalies.diff).toBe(10001);
      });

      it('should detect negative diff (orders > payments) with warning', async () => {
        const env = createMockEnv({
          ordersRow: { count: 3, totalNet: 12001, totalFee: 0 },
          paymentsRow: { count: 2, totalAmount: 10000, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('warning');
        expect(report.anomalies.diff).toBe(-2001);
      });

      it('should detect negative diff (orders > payments) with critical', async () => {
        const env = createMockEnv({
          ordersRow: { count: 5, totalNet: 30000, totalFee: 0 },
          paymentsRow: { count: 2, totalAmount: 10000, totalFee: 0 },
        });

        const report = await generateDailyReport(env, '2026-01-01');

        expect(report.anomalies.level).toBe('critical');
        expect(report.anomalies.diff).toBe(-20000);
      });
    });

    // ----- Anomaly message format -----

    it('should format anomaly message as "LEVEL diff: VALUE"', async () => {
      const env = createMockEnv({
        ordersRow: { count: 1, totalNet: 5000, totalFee: 0 },
        paymentsRow: { count: 1, totalAmount: 7000, totalFee: 0 },
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.anomalies.message).toBe('WARNING diff: 2000');
    });

    it('should format critical anomaly message correctly', async () => {
      const env = createMockEnv({
        ordersRow: { count: 1, totalNet: 0, totalFee: 0 },
        paymentsRow: { count: 1, totalAmount: 50000, totalFee: 0 },
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.anomalies.message).toBe('CRITICAL diff: 50000');
    });

    // ----- null/empty DB results -----

    it('should handle null ordersRow from DB', async () => {
      const env = createMockEnv({
        ordersRow: null,
        paymentsRow: { count: 1, totalAmount: 5000, totalFee: 100 },
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.orders).toEqual({ count: 0, totalNet: 0, totalFee: 0 });
      expect(report.payments.totalAmount).toBe(5000);
      expect(report.anomalies.diff).toBe(5000);
    });

    it('should handle null paymentsRow from DB', async () => {
      const env = createMockEnv({
        ordersRow: { count: 2, totalNet: 8000, totalFee: 400 },
        paymentsRow: null,
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.payments).toEqual({ count: 0, totalAmount: 0, totalFee: 0 });
      expect(report.anomalies.diff).toBe(-8000);
    });

    it('should handle null refundsRow from DB', async () => {
      const env = createMockEnv({
        ordersRow: { count: 1, totalNet: 5000, totalFee: 0 },
        paymentsRow: { count: 1, totalAmount: 5000, totalFee: 0 },
        refundsRow: null,
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.refunds).toEqual({ count: 0, totalAmount: 0 });
    });

    it('should handle all null DB results', async () => {
      const env = createMockEnv({
        ordersRow: null,
        paymentsRow: null,
        refundsRow: null,
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.orders).toEqual({ count: 0, totalNet: 0, totalFee: 0 });
      expect(report.payments).toEqual({ count: 0, totalAmount: 0, totalFee: 0 });
      expect(report.refunds).toEqual({ count: 0, totalAmount: 0 });
      expect(report.anomalies.level).toBe('ok');
      expect(report.anomalies.diff).toBe(0);
    });

    // ----- Edge case: 0 orders but payments exist -----

    it('should detect anomaly when 0 orders but payments exist', async () => {
      const env = createMockEnv({
        ordersRow: { count: 0, totalNet: 0, totalFee: 0 },
        paymentsRow: { count: 3, totalAmount: 15000, totalFee: 500 },
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.orders.count).toBe(0);
      expect(report.payments.count).toBe(3);
      expect(report.anomalies.level).toBe('critical');
      expect(report.anomalies.diff).toBe(15000);
    });

    it('should be ok when 0 orders and 0 payments', async () => {
      const env = createMockEnv({
        ordersRow: { count: 0, totalNet: 0, totalFee: 0 },
        paymentsRow: { count: 0, totalAmount: 0, totalFee: 0 },
      });

      const report = await generateDailyReport(env, '2026-01-01');

      expect(report.anomalies.level).toBe('ok');
      expect(report.anomalies.diff).toBe(0);
    });

    // ----- Return structure -----

    it('should always include the date in the report', async () => {
      const env = createMockEnv();

      const report = await generateDailyReport(env, '2026-12-31');

      expect(report.date).toBe('2026-12-31');
    });
  });
});
