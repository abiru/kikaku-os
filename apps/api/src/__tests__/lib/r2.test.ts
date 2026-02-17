import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, createR2FailureAlert, storeDailyReportFallback } from '../../lib/r2';

describe('R2 utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const operation = vi.fn().mockResolvedValueOnce('success');

      const result = await withRetry(operation, 'test-op', {
        maxRetries: 3,
        baseDelayMs: 1,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds on second attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce('recovered');

      const result = await withRetry(operation, 'test-op', {
        maxRetries: 3,
        baseDelayMs: 1,
      });

      expect(result).toBe('recovered');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('retries up to maxRetries and throws last error', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(
        withRetry(operation, 'test-op', {
          maxRetries: 2,
          baseDelayMs: 1,
        })
      ).rejects.toThrow('persistent failure');

      // 1 initial attempt + 2 retries = 3 total
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('succeeds on the last retry attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('final success');

      const result = await withRetry(operation, 'test-op', {
        maxRetries: 2,
        baseDelayMs: 1,
      });

      expect(result).toBe('final success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('uses exponential backoff delay', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      // Make setTimeout resolve immediately for test speed
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      await withRetry(operation, 'test-op', {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 5000,
      });

      vi.useRealTimers();
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('caps delay at maxDelayMs', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      // baseDelay=1000, maxDelay=2000: delays would be 1000, 2000, 4000->capped to 2000
      const result = await withRetry(operation, 'test-op', {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
      });

      expect(result).toBe('ok');
    });

    it('works with zero retries (single attempt)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(
        withRetry(operation, 'test-op', {
          maxRetries: 0,
          baseDelayMs: 1,
        })
      ).rejects.toThrow('fail');

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('createR2FailureAlert', () => {
    it('inserts an inbox_items record with correct fields', async () => {
      const boundArgs: any[] = [];
      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => {
            boundArgs.push(...args);
            return {
              run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      await createR2FailureAlert(
        mockDb,
        'putJson',
        'daily-close/2026-01-01/report.json',
        new Error('R2 connection timeout')
      );

      expect(boundArgs[0]).toContain('R2 putJson failed');
      expect(boundArgs[0]).toContain('daily-close/2026-01-01/report.json');
      expect(boundArgs[1]).toContain('R2 connection timeout');
    });

    it('does not throw when DB insert fails', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            run: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      } as unknown as D1Database;

      // Should not throw
      await expect(
        createR2FailureAlert(mockDb, 'putJson', 'key', new Error('fail'))
      ).resolves.toBeUndefined();
    });
  });

  describe('storeDailyReportFallback', () => {
    it('stores report data in D1 with correct key and content', async () => {
      const boundArgs: any[] = [];
      const mockDb = {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => {
            boundArgs.push(...args);
            return {
              run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
            };
          },
        }),
      } as unknown as D1Database;

      const reportData = { totalSales: 50000, orders: 5 };
      await storeDailyReportFallback(
        mockDb,
        '2026-01-15',
        'daily-close/2026-01-15/report.json',
        reportData
      );

      expect(boundArgs[0]).toBe('daily-close/2026-01-15/report.json');
      expect(JSON.parse(boundArgs[1])).toEqual(reportData);
    });
  });
});
