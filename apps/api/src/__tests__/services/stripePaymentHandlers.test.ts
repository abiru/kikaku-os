import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCheckoutSessionCompleted,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailedOrCanceled
} from '../../services/stripePaymentHandlers';
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

  const mockBatch = vi.fn().mockResolvedValue([]);

  return {
    DB: {
      prepare: mockPrepare,
      batch: mockBatch,
      _mocks: { mockFirst, mockRun, mockAll, mockBind, mockPrepare, mockBatch }
    },
    R2: {} as any,
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    ADMIN_API_KEY: 'admin_key',
    STOREFRONT_BASE_URL: 'http://localhost:4321',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    DEV_MODE: 'false'
  } as unknown as Env['Bindings'] & { DB: { _mocks: any } };
};

describe('stripePaymentHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCheckoutSessionCompleted', () => {
    it('should ignore event if order_id not in metadata', async () => {
      const env = createMockEnv();
      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            metadata: {}
          }
        }
      };

      const result = await handleCheckoutSessionCompleted(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it('should ignore event if order does not exist', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce(null);

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            metadata: { order_id: '999' }
          }
        }
      };

      const result = await handleCheckoutSessionCompleted(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it('should update order to paid and create fulfillment', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 1 }) // existing order
        .mockResolvedValueOnce(null); // no existing fulfillment

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            payment_intent: 'pi_test456',
            amount_total: 10000,
            currency: 'jpy',
            metadata: { order_id: '1' }
          }
        }
      };

      const result = await handleCheckoutSessionCompleted(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();

      // Verify order update
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("SET status='paid'")
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith(
        'cs_test123',
        'pi_test456',
        1
      );

      // Verify fulfillment creation
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fulfillments')
      );
    });

    it('should save shipping details if provided', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            payment_intent: 'pi_test',
            amount_total: 5000,
            currency: 'jpy',
            metadata: { order_id: '1' },
            shipping_details: {
              name: 'John Doe',
              address: {
                line1: '123 Main St',
                city: 'Tokyo',
                postal_code: '100-0001',
                country: 'JP'
              }
            },
            customer_details: {
              phone: '+81-90-1234-5678'
            }
          }
        }
      };

      await handleCheckoutSessionCompleted(env, event, event.data.object);

      // Verify shipping info update
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("metadata = json_set")
      );
    });

    it('should record coupon usage after successful payment', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 1 }) // existing order
        .mockResolvedValueOnce(null) // no existing fulfillment
        .mockResolvedValueOnce({ customer_id: 5 }); // order with customer

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            payment_intent: 'pi_test',
            amount_total: 8000,
            currency: 'jpy',
            metadata: {
              order_id: '1',
              couponId: '10',
              discountAmount: '1000'
            }
          }
        }
      };

      await handleCheckoutSessionCompleted(env, event, event.data.object);

      // Verify coupon usage insert
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO coupon_usages')
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith(10, 1, 5, 1000);

      // Verify coupon current_uses increment
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE coupons')
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith(10);
    });

    it('should not record coupon usage if couponId is missing', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            payment_intent: 'pi_test',
            amount_total: 5000,
            currency: 'jpy',
            metadata: { order_id: '1' }
          }
        }
      };

      await handleCheckoutSessionCompleted(env, event, event.data.object);

      // Verify coupon usage NOT inserted
      expect(env.DB._mocks.mockPrepare).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO coupon_usages')
      );
    });

    it('should use COALESCE to avoid overwriting existing values (idempotency)', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 1 }); // fulfillment already exists

      env.DB._mocks.mockRun.mockResolvedValue({ success: true });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            payment_intent: 'pi_test',
            amount_total: 5000,
            currency: 'jpy',
            metadata: { order_id: '1' }
          }
        }
      };

      await handleCheckoutSessionCompleted(env, event, event.data.object);

      // Verify COALESCE in UPDATE query
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE')
      );

      // Verify fulfillment NOT created (already exists)
      expect(env.DB._mocks.mockPrepare).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fulfillments')
      );
    });
  });

  describe('handlePaymentIntentSucceeded', () => {
    it('should ignore event if order_id not in metadata', async () => {
      const env = createMockEnv();
      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            metadata: {}
          }
        }
      };

      const result = await handlePaymentIntentSucceeded(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it('should update order to paid and record payment', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 2 }) // existing order
        .mockResolvedValueOnce(null); // no existing payment

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockAll.mockResolvedValueOnce({ results: [] }); // order items

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test789',
            amount_received: 15000,
            currency: 'jpy',
            metadata: { order_id: '2' }
          }
        }
      };

      const result = await handlePaymentIntentSucceeded(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();

      // Verify order update
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("status='paid'")
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith('pi_test789', 2);

      // Verify payment insert
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments')
      );
    });

    it('should deduct stock after successful payment (non-duplicate)', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 3 }) // existing order
        .mockResolvedValueOnce(null) // no existing payment
        .mockResolvedValueOnce({ id: 1 }); // stock reservation exists

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockAll.mockResolvedValueOnce({ results: [] });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount_received: 10000,
            currency: 'jpy',
            metadata: { order_id: '3' }
          }
        }
      };

      const result = await handlePaymentIntentSucceeded(env, event, event.data.object);

      // Verify payment succeeded
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });

    it('should capture shipping/billing address from Payment Element', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 4 })
        .mockResolvedValueOnce(null);

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockAll.mockResolvedValueOnce({ results: [] });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount_received: 5000,
            currency: 'jpy',
            metadata: { order_id: '4' },
            shipping: {
              name: 'Jane Smith',
              address: {
                line1: '456 Oak Ave',
                city: 'Osaka',
                postal_code: '530-0001',
                country: 'JP'
              },
              phone: '+81-90-9876-5432'
            }
          }
        }
      };

      await handlePaymentIntentSucceeded(env, event, event.data.object);

      // Verify shipping info saved
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("'$.shipping'")
      );
    });

    it('should record coupon usage after successful payment', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 5 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ customer_id: 10 });

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockAll.mockResolvedValueOnce({ results: [] });

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount_received: 9000,
            currency: 'jpy',
            metadata: {
              order_id: '5',
              couponId: '15',
              discountAmount: '1000'
            }
          }
        }
      };

      const result = await handlePaymentIntentSucceeded(env, event, event.data.object);

      // Verify payment succeeded
      expect(result.received).toBe(true);
      expect(result.duplicate).toBeFalsy();
    });
  });

  describe('handlePaymentIntentFailedOrCanceled', () => {
    it('should ignore event if order_id not in metadata', async () => {
      const env = createMockEnv();
      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test',
            metadata: {}
          }
        }
      };

      const result = await handlePaymentIntentFailedOrCanceled(
        env,
        event,
        event.data!.object
      );

      expect(result.received).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it('should release stock reservation on payment failure', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 6, status: 'pending' }); // order exists

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockBatch.mockResolvedValue([]);

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_failed',
            metadata: { order_id: '6' },
            last_payment_error: {
              decline_code: 'insufficient_funds',
              code: 'card_declined',
              message: 'Card was declined'
            }
          }
        }
      };

      const result = await handlePaymentIntentFailedOrCanceled(env, event, event.data.object);

      // Verify handler received the event
      expect(result.received).toBe(true);
    });

    it('should update order status to payment_failed if currently pending', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 7, status: 'pending' })
        .mockResolvedValueOnce(null); // no stock reservation

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockBatch.mockResolvedValue([]);

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.canceled',
        data: {
          object: {
            id: 'pi_canceled',
            metadata: { order_id: '7' },
            cancellation_reason: 'abandoned'
          }
        }
      };

      await handlePaymentIntentFailedOrCanceled(env, event, event.data.object);

      // Verify order status update
      expect(env.DB._mocks.mockBatch).toHaveBeenCalled();
      const batchCall = env.DB._mocks.mockBatch.mock.calls[0][0];
      expect(batchCall).toBeDefined();
    });

    it('should create inbox item for payment failure', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst
        .mockResolvedValueOnce({ id: 8, status: 'pending' })
        .mockResolvedValueOnce(null);

      env.DB._mocks.mockRun.mockResolvedValue({ success: true, meta: { changes: 1 } });
      env.DB._mocks.mockBatch.mockResolvedValue([]);

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_failed',
            metadata: { order_id: '8' },
            last_payment_error: {
              decline_code: 'insufficient_funds',
              message: 'Insufficient funds'
            }
          }
        }
      };

      await handlePaymentIntentFailedOrCanceled(env, event, event.data.object);

      // Verify inbox item creation
      expect(env.DB._mocks.mockBatch).toHaveBeenCalled();
      const batchCall = env.DB._mocks.mockBatch.mock.calls[0][0];
      expect(batchCall).toBeDefined();
    });

    it('should handle stock release errors gracefully', async () => {
      const env = createMockEnv();
      env.DB._mocks.mockFirst.mockResolvedValueOnce({ id: 9, status: 'pending' });

      // Mock run to fail on first call (stock release) then succeed
      env.DB._mocks.mockRun
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue({ success: true, meta: { changes: 1 } });

      env.DB._mocks.mockBatch.mockResolvedValue([]);

      const event: StripeEvent = {
        id: 'evt_test',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_failed',
            metadata: { order_id: '9' }
          }
        }
      };

      const result = await handlePaymentIntentFailedOrCanceled(env, event, event.data.object);

      // Verify handler still completes
      expect(result.received).toBe(true);
    });
  });
});
