import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectLowStock,
  detectNegativeStock,
  detectHighRefundRate,
  detectWebhookFailures,
  detectUnfulfilledOrders,
  runAllAnomalyChecks
} from './anomalyRules';

const createMockDB = (mockResults: Record<string, any> = {}) => {
  const prepareResults: Record<string, any> = {};

  return {
    prepare: vi.fn((sql: string) => {
      // Determine which mock result to return based on SQL content
      let result: any = { results: [] };

      if (sql.includes('HAVING on_hand < t.threshold AND on_hand >= 0')) {
        result = mockResults.lowStock ?? { results: [] };
      } else if (sql.includes('HAVING on_hand < 0')) {
        result = mockResults.negativeStock ?? { results: [] };
      } else if (sql.includes('order_total') && sql.includes('refund_total')) {
        result = mockResults.refundRate ?? null;
      } else if (sql.includes("processing_status = 'failed'")) {
        result = mockResults.webhookFailures ?? null;
      } else if (sql.includes('julianday') && sql.includes('fulfillments')) {
        result = mockResults.unfulfilled ?? { results: [] };
      } else if (sql.includes('INSERT INTO inbox_items')) {
        result = { meta: { last_row_id: 1 } };
      }

      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(result),
        first: vi.fn().mockResolvedValue(result),
        run: vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } })
      };
    })
  } as unknown as D1Database;
};

describe('Anomaly Rules', () => {
  const testDate = '2026-01-18';

  describe('detectLowStock', () => {
    it('returns empty array when no low stock variants', async () => {
      const db = createMockDB({ lowStock: { results: [] } });
      const result = await detectLowStock({ DB: db }, testDate);
      expect(result).toEqual([]);
    });

    it('creates inbox items for low stock variants', async () => {
      const db = createMockDB({
        lowStock: {
          results: [
            {
              variant_id: 1,
              variant_title: 'Size M',
              product_title: 'T-Shirt',
              on_hand: 2,
              threshold: 10
            }
          ]
        }
      });

      const result = await detectLowStock({ DB: db }, testDate);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('low_stock_1');
      expect(result[0].date).toBe(testDate);
    });
  });

  describe('detectNegativeStock', () => {
    it('returns empty array when no negative stock', async () => {
      const db = createMockDB({ negativeStock: { results: [] } });
      const result = await detectNegativeStock({ DB: db }, testDate);
      expect(result).toEqual([]);
    });

    it('creates critical inbox items for negative stock', async () => {
      const db = createMockDB({
        negativeStock: {
          results: [
            {
              variant_id: 2,
              variant_title: 'Size L',
              product_title: 'Hoodie',
              on_hand: -5
            }
          ]
        }
      });

      const result = await detectNegativeStock({ DB: db }, testDate);
      expect(result.length).toBe(1);
      expect(result[0].kind).toBe('negative_stock_2');
    });
  });

  describe('detectHighRefundRate', () => {
    it('returns null when no orders on the day', async () => {
      const db = createMockDB({
        refundRate: { order_total: 0, refund_total: 0 }
      });
      const result = await detectHighRefundRate({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('returns null when refund rate is below threshold', async () => {
      const db = createMockDB({
        refundRate: { order_total: 10000, refund_total: 1000 } // 10%
      });
      const result = await detectHighRefundRate({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates inbox item when refund rate exceeds 30%', async () => {
      const db = createMockDB({
        refundRate: { order_total: 10000, refund_total: 4000 } // 40%
      });
      const result = await detectHighRefundRate({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('high_refund_rate');
    });
  });

  describe('detectWebhookFailures', () => {
    it('returns null when no failures', async () => {
      const db = createMockDB({
        webhookFailures: { failure_count: 0, event_ids: null, event_types: null }
      });
      const result = await detectWebhookFailures({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates inbox item for webhook failures', async () => {
      const db = createMockDB({
        webhookFailures: {
          failure_count: 3,
          event_ids: 'evt_1,evt_2,evt_3',
          event_types: 'checkout.session.completed,payment_intent.succeeded'
        }
      });
      const result = await detectWebhookFailures({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('webhook_failures');
    });
  });

  describe('detectUnfulfilledOrders', () => {
    it('returns null when no unfulfilled orders', async () => {
      const db = createMockDB({ unfulfilled: { results: [] } });
      const result = await detectUnfulfilledOrders({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates inbox item for unfulfilled orders', async () => {
      const db = createMockDB({
        unfulfilled: {
          results: [
            {
              order_id: 100,
              customer_id: 1,
              customer_email: 'test@example.com',
              total_net: 5000,
              currency: 'JPY',
              paid_at: '2026-01-10T00:00:00Z',
              days_since_paid: 8
            }
          ]
        }
      });
      const result = await detectUnfulfilledOrders({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('unfulfilled_orders');
    });
  });

  describe('runAllAnomalyChecks', () => {
    it('runs all checks and returns combined results', async () => {
      const db = createMockDB({
        lowStock: { results: [] },
        negativeStock: { results: [] },
        refundRate: { order_total: 10000, refund_total: 500 },
        webhookFailures: { failure_count: 0, event_ids: null, event_types: null },
        unfulfilled: { results: [] }
      });

      const result = await runAllAnomalyChecks({ DB: db }, testDate);

      expect(result.date).toBe(testDate);
      expect(result.lowStock).toEqual([]);
      expect(result.negativeStock).toEqual([]);
      expect(result.highRefundRate).toBeNull();
      expect(result.webhookFailures).toBeNull();
      expect(result.unfulfilledOrders).toBeNull();
    });
  });
});
