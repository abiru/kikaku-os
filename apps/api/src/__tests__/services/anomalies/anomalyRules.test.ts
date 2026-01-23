import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectLowStock,
  detectNegativeStock,
  detectHighRefundRate,
  detectWebhookFailures,
  detectUnfulfilledOrders,
  detectOrderVolumeSpike,
  detectPaymentFailureRate,
  detectAOVAnomaly,
  runAllAnomalyChecks
} from '../../../services/anomalyRules';

const createMockDB = (mockResults: Record<string, any> = {}) => {
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
      } else if (sql.includes('AVG(cnt) as avg_orders')) {
        result = mockResults.orderVolumeAvg ?? { avg_orders: null };
      } else if (sql.includes('today_orders') && sql.includes('COUNT(*)')) {
        result = mockResults.orderVolumeToday ?? { today_orders: 0 };
      } else if (sql.includes('checkout.session.completed') && sql.includes('payment_intent.payment_failed')) {
        result = mockResults.paymentFailure ?? { completed: 0, failed: 0 };
      } else if (sql.includes('avg_aov') && sql.includes('-30 days')) {
        result = mockResults.aovAvg ?? { avg_aov: null };
      } else if (sql.includes('today_aov') && sql.includes('order_count')) {
        result = mockResults.aovToday ?? { today_aov: null, order_count: 0 };
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

  describe('detectOrderVolumeSpike', () => {
    it('returns null when no historical data', async () => {
      const db = createMockDB({
        orderVolumeAvg: { avg_orders: null },
        orderVolumeToday: { today_orders: 10 }
      });
      const result = await detectOrderVolumeSpike({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('returns null when volume is within threshold', async () => {
      const db = createMockDB({
        orderVolumeAvg: { avg_orders: 10 },
        orderVolumeToday: { today_orders: 15 } // 150% of avg, below 200% threshold
      });
      const result = await detectOrderVolumeSpike({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates warning inbox item when volume exceeds 200%', async () => {
      const db = createMockDB({
        orderVolumeAvg: { avg_orders: 10 },
        orderVolumeToday: { today_orders: 25 } // 250% of avg
      });
      const result = await detectOrderVolumeSpike({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('order_volume_spike');
    });

    it('creates critical inbox item when volume exceeds 300%', async () => {
      const db = createMockDB({
        orderVolumeAvg: { avg_orders: 10 },
        orderVolumeToday: { today_orders: 35 } // 350% of avg
      });
      const result = await detectOrderVolumeSpike({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('order_volume_spike');
    });
  });

  describe('detectPaymentFailureRate', () => {
    it('returns null when no payment attempts', async () => {
      const db = createMockDB({
        paymentFailure: { completed: 0, failed: 0 }
      });
      const result = await detectPaymentFailureRate({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('returns null when failure rate is below threshold', async () => {
      const db = createMockDB({
        paymentFailure: { completed: 90, failed: 10 } // 10% failure
      });
      const result = await detectPaymentFailureRate({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates warning inbox item when failure rate exceeds 20%', async () => {
      const db = createMockDB({
        paymentFailure: { completed: 70, failed: 30 } // 30% failure
      });
      const result = await detectPaymentFailureRate({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('payment_failure_rate');
    });

    it('creates critical inbox item when failure rate exceeds 40%', async () => {
      const db = createMockDB({
        paymentFailure: { completed: 50, failed: 50 } // 50% failure
      });
      const result = await detectPaymentFailureRate({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('payment_failure_rate');
    });
  });

  describe('detectAOVAnomaly', () => {
    it('returns null when no historical data', async () => {
      const db = createMockDB({
        aovAvg: { avg_aov: null },
        aovToday: { today_aov: 5000, order_count: 5 }
      });
      const result = await detectAOVAnomaly({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('returns null when no orders today', async () => {
      const db = createMockDB({
        aovAvg: { avg_aov: 5000 },
        aovToday: { today_aov: null, order_count: 0 }
      });
      const result = await detectAOVAnomaly({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('returns null when AOV is within threshold', async () => {
      const db = createMockDB({
        aovAvg: { avg_aov: 5000 },
        aovToday: { today_aov: 6000, order_count: 5 } // 20% higher, below 50% threshold
      });
      const result = await detectAOVAnomaly({ DB: db }, testDate);
      expect(result).toBeNull();
    });

    it('creates warning inbox item when AOV deviates more than 50%', async () => {
      const db = createMockDB({
        aovAvg: { avg_aov: 5000 },
        aovToday: { today_aov: 8000, order_count: 5 } // 60% higher
      });
      const result = await detectAOVAnomaly({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('aov_anomaly');
    });

    it('detects lower AOV anomaly', async () => {
      const db = createMockDB({
        aovAvg: { avg_aov: 10000 },
        aovToday: { today_aov: 3000, order_count: 5 } // 70% lower
      });
      const result = await detectAOVAnomaly({ DB: db }, testDate);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('aov_anomaly');
    });
  });

  describe('runAllAnomalyChecks', () => {
    it('runs all checks and returns combined results', async () => {
      const db = createMockDB({
        lowStock: { results: [] },
        negativeStock: { results: [] },
        refundRate: { order_total: 10000, refund_total: 500 },
        webhookFailures: { failure_count: 0, event_ids: null, event_types: null },
        unfulfilled: { results: [] },
        orderVolumeAvg: { avg_orders: 10 },
        orderVolumeToday: { today_orders: 12 },
        paymentFailure: { completed: 100, failed: 5 },
        aovAvg: { avg_aov: 5000 },
        aovToday: { today_aov: 5500, order_count: 10 }
      });

      const result = await runAllAnomalyChecks({ DB: db }, testDate);

      expect(result.date).toBe(testDate);
      expect(result.lowStock).toEqual([]);
      expect(result.negativeStock).toEqual([]);
      expect(result.highRefundRate).toBeNull();
      expect(result.webhookFailures).toBeNull();
      expect(result.unfulfilledOrders).toBeNull();
      expect(result.orderVolumeSpike).toBeNull();
      expect(result.paymentFailureRate).toBeNull();
      expect(result.aovAnomaly).toBeNull();
    });
  });
});
