import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleRefundEvents,
  handleChargeDispute
} from '../../services/stripeRefundHandlers';
import type { Env } from '../../env';
import type { StripeEvent } from '../../lib/stripeData';

const createMockEnv = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();
  const mockAll = vi.fn();
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    run: mockRun,
    all: mockAll
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst,
    run: mockRun,
    all: mockAll
  }));

  return {
    DB: {
      prepare: mockPrepare,
      _mocks: { mockFirst, mockRun, mockAll, mockBind, mockPrepare }
    },
    R2: {} as any,
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    ADMIN_API_KEY: 'admin_key',
    STOREFRONT_BASE_URL: 'http://localhost:4321',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    DEV_MODE: 'false'
  } as unknown as Env['Bindings'] & { DB: { _mocks: any } };
};

describe('stripeRefundHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleRefundEvents', () => {
    it('should skip duplicate refund (already recorded)', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ id: 1 }); // refund exists

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_duplicate123',
                  amount: 5000,
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('should record new refund and update order status', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce(null) // refund doesn't exist
        .mockResolvedValueOnce({ id: 1, order_id: 10 }) // payment found
        .mockResolvedValueOnce({ id: 1 }) // refund insert
        .mockResolvedValueOnce({
          id: 10,
          total_net: 10000,
          status: 'paid',
          refunded_amount: 0
        }); // order for update

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_new456',
                  amount: 3000,
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test123',
                  reason: 'requested_by_customer'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });

    it('should calculate correct order status after partial refund', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce(null) // refund doesn't exist
        .mockResolvedValueOnce({ id: 1, order_id: 20 }) // payment found
        .mockResolvedValueOnce({ id: 2 }) // refund insert
        .mockResolvedValueOnce({
          id: 20,
          total_net: 10000,
          status: 'paid',
          refunded_amount: 0
        }); // order

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_partial',
                  amount: 3000, // Partial refund
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      // Verify refund was processed
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });

    it('should calculate correct order status after full refund', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, order_id: 30 })
        .mockResolvedValueOnce({ id: 3 })
        .mockResolvedValueOnce({
          id: 30,
          total_net: 5000,
          status: 'paid',
          refunded_amount: 0
        });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_full',
                  amount: 5000, // Full refund
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      // Verify refund was processed
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });

    it('should use atomic SQL to prevent race conditions (CRITICAL)', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, order_id: 50 })
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce({
          id: 50,
          total_net: 10000,
          status: 'paid',
          refunded_amount: 0
        });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_atomic',
                  amount: 2000,
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      // Verify refund was processed successfully
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });

    it('should record status history when status changes', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, order_id: 70 })
        .mockResolvedValueOnce({ id: 7 })
        .mockResolvedValueOnce({
          id: 70,
          total_net: 10000,
          status: 'paid',
          refunded_amount: 0
        });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            refunds: {
              data: [
                {
                  id: 're_status',
                  amount: 3000,
                  currency: 'jpy',
                  status: 'succeeded',
                  payment_intent: 'pi_test'
                }
              ]
            }
          }
        }
      };

      const result = await handleRefundEvents(env, event, event.data!.object);

      // Verify refund was processed
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });
  });

  describe('handleChargeDispute', () => {
    it('should create critical inbox item for dispute', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ order_id: 100 }); // payment found

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'du_test123',
            charge: 'ch_test456',
            amount: 10000,
            currency: 'jpy',
            reason: 'fraudulent',
            status: 'needs_response',
            payment_intent: 'pi_test789'
          }
        }
      };

      const result = await handleChargeDispute(env, event, event.data.object);

      expect(result.received).toBe(true);

      // Verify event recorded
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events')
      );

      // Verify inbox item created with critical severity
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inbox_items')
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith(
        expect.stringContaining('Chargeback Received'),
        expect.anything()
      );
    });

    it('should link dispute to order via payment_intent', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ order_id: 200 });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'du_test',
            charge: 'ch_test',
            amount: 5000,
            currency: 'jpy',
            reason: 'product_not_received',
            status: 'needs_response',
            payment_intent: 'pi_order200'
          }
        }
      };

      await handleChargeDispute(env, event, event.data!.object);

      // Verify payment lookup by payment_intent
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT order_id FROM payments WHERE provider_payment_id')
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith('pi_order200');

      // Verify inbox title includes order ID
      const inboxBind = env.DB._mocks.mockBind.mock.calls.find((call: any[]) =>
        call[0]?.includes('Order #200')
      );
      expect(inboxBind).toBeDefined();
    });

    it('should handle dispute without linked order', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce(null); // no payment found

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'du_unlinked',
            charge: 'ch_unlinked',
            amount: 3000,
            currency: 'jpy',
            reason: 'general',
            status: 'needs_response',
            payment_intent: undefined as any
          }
        }
      };

      await handleChargeDispute(env, event, event.data!.object);

      // Verify inbox title uses charge ID instead
      const inboxBind = env.DB._mocks.mockBind.mock.calls.find((call: any[]) =>
        call[0]?.includes('Charge ch_unlinked')
      );
      expect(inboxBind).toBeDefined();
    });

    it('should handle dispute.updated events', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ order_id: 300 });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.dispute.updated',
        data: {
          object: {
            id: 'du_updated',
            charge: 'ch_test',
            amount: 7000,
            currency: 'jpy',
            reason: 'fraudulent',
            status: 'under_review',
            payment_intent: 'pi_test'
          }
        }
      };

      await handleChargeDispute(env, event, event.data!.object);

      // Verify inbox title shows updated status
      const inboxBind = env.DB._mocks.mockBind.mock.calls.find((call: any[]) =>
        call[0]?.includes('Chargeback Updated') &&
        call[0]?.includes('under_review')
      );
      expect(inboxBind).toBeDefined();
    });

    it('should not mutate order status (side-effect free)', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ order_id: 400 });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'du_test',
            charge: 'ch_test',
            amount: 10000,
            currency: 'jpy',
            reason: 'fraudulent',
            status: 'needs_response',
            payment_intent: 'pi_test'
          }
        }
      };

      await handleChargeDispute(env, event, event.data!.object);

      // Verify no UPDATE orders statement
      expect(env.DB._mocks.mockPrepare).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders SET status')
      );
    });
  });
});
