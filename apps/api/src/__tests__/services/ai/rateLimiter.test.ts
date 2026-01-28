import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, trackAIUsage, getDailyCostEstimate, checkDailyBudget } from '../../../services/ai/rateLimiter';

describe('AI Rate Limiter', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    // Mock D1 Database
    const mockResults: Record<string, any> = {};

    mockDb = {
      prepare: (sql: string) => ({
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes('SUM(request_count)')) {
              return { count: 50 }; // Mock current usage
            }
            if (sql.includes('SUM(estimated_cost_cents)')) {
              return { cost: 5000 }; // Mock cost
            }
            return null;
          },
          all: async () => ({
            results: [
              { service: 'claude', operation: 'content_generation', cost: 3000 },
              { service: 'claude', operation: 'inbox_triage', cost: 2000 },
            ],
          }),
          run: async () => ({
            meta: { changes: 1, last_row_id: 1 },
          }),
        }),
      }),
    } as unknown as D1Database;
  });

  describe('checkRateLimit', () => {
    it('should allow requests under limit', async () => {
      const result = await checkRateLimit(mockDb, 'claude', 'content_generation', 100, 10000);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(50);
    });

    it('should use default limit when not specified', async () => {
      const result = await checkRateLimit(mockDb, 'claude', 'content_generation');

      expect(result.limit).toBe(100);
    });

    it('should include budget warning at 90%', async () => {
      // Mock DB to return high usage (90% of budget)
      const highUsageDb = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ count: 50, cost: 9000, total: 9000 }),
            all: async () => ({ results: [{ cost: 9000 }] }),
            run: async () => ({ meta: { changes: 1 } }),
          }),
        }),
      } as unknown as D1Database;

      const result = await checkRateLimit(highUsageDb, 'claude', 'test', 100, 10000);

      expect(result.budgetWarning).toBeDefined();
      expect(result.budgetWarning).toContain('90%');
    });
  });

  describe('trackAIUsage', () => {
    it('should track AI usage without throwing', async () => {
      await expect(
        trackAIUsage(mockDb, 'claude', 'content_generation', 1000)
      ).resolves.not.toThrow();
    });

    it('should handle errors gracefully', async () => {
      const errorDb = {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error('DB error');
            },
          }),
        }),
      } as unknown as D1Database;

      // Should not throw even if DB fails
      await expect(
        trackAIUsage(errorDb, 'claude', 'test', 100)
      ).resolves.not.toThrow();
    });
  });

  describe('getDailyCostEstimate', () => {
    it('should return daily cost breakdown', async () => {
      const result = await getDailyCostEstimate(mockDb, '2026-01-28');

      expect(result.totalCents).toBe(5000);
      expect(result.byOperation).toHaveLength(2);
      expect(result.byOperation[0].cost).toBe(3000);
    });

    it('should return zero when no usage', async () => {
      const emptyDb = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({ results: [] }),
          }),
        }),
      } as unknown as D1Database;

      const result = await getDailyCostEstimate(emptyDb, '2026-01-28');

      expect(result.totalCents).toBe(0);
      expect(result.byOperation).toHaveLength(0);
    });
  });

  describe('checkDailyBudget', () => {
    it('should check budget status', async () => {
      const budgetDb = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [{ cost: 5000 }],
            }),
          }),
        }),
      } as unknown as D1Database;

      const result = await checkDailyBudget(budgetDb, '2026-01-28', 10000);

      expect(result.exceeded).toBe(false);
      expect(result.used).toBe(5000);
      expect(result.budget).toBe(10000);
      expect(result.percentage).toBe(50);
    });

    it('should detect budget exceeded', async () => {
      const overBudgetDb = {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [{ cost: 12000 }],
            }),
          }),
        }),
      } as unknown as D1Database;

      const result = await checkDailyBudget(overBudgetDb, '2026-01-28', 10000);

      expect(result.exceeded).toBe(true);
      expect(result.percentage).toBe(120);
    });
  });
});
