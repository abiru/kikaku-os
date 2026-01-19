/**
 * Stripe Webhook Integration Tests
 *
 * These tests use wrangler's unstable_dev to spin up a real worker with D1.
 * Run with: pnpm test stripeWebhook.integration
 *
 * Prerequisites:
 * - Local D1 database with migrations applied
 * - STRIPE_WEBHOOK_SECRET in .dev.vars
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { computeStripeSignature } from '../lib/stripe';

const TEST_WEBHOOK_SECRET = 'whsec_test_secret';

type SeedResponse = {
  ok: boolean;
  data?: {
    created: {
      orders: number;
    };
  };
};

type OrderResponse = {
  ok: boolean;
  data?: {
    order: {
      id: number;
      status: string;
      total_net: number;
      provider_payment_intent_id?: string;
    };
  };
};

describe.skip('Stripe Webhook Integration', () => {
  let worker: Unstable_DevWorker;
  let testOrderId: number;
  let testOrderTotal: number;

  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
      local: true,
      vars: {
        DEV_MODE: 'true',
        STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
        STRIPE_SECRET_KEY: 'sk_test_fake',
        ADMIN_API_KEY: 'test-admin-key'
      }
    });

    // Seed test data and get order ID
    const seedRes = await worker.fetch('/dev/seed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orders: 1, payments: 0, refunds: 0, makeInbox: false })
    });
    const seedJson = await seedRes.json() as SeedResponse;
    expect(seedJson.ok).toBe(true);

    // Get all orders and find a 'paid' one
    const ordersRes = await worker.fetch('/admin/orders', {
      headers: { 'x-admin-key': 'test-admin-key' }
    });
    const ordersJson = await ordersRes.json() as { ok: boolean; data?: { orders: Array<{ id: number; status: string; total_net: number }> } };
    const orders = ordersJson.data?.orders || [];
    const paidOrder = orders.find(o => o.status === 'paid');
    expect(paidOrder).toBeDefined();

    testOrderId = paidOrder!.id;
    testOrderTotal = paidOrder!.total_net;
  }, 30000);

  afterAll(async () => {
    await worker?.stop();
  });

  const sendWebhook = async (event: object) => {
    const payload = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await computeStripeSignature(payload, TEST_WEBHOOK_SECRET, timestamp);

    return worker.fetch('/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${timestamp},v1=${signature}`
      },
      body: payload
    });
  };

  const getOrder = async (orderId: number): Promise<OrderResponse> => {
    const res = await worker.fetch(`/admin/orders/${orderId}`, {
      headers: { 'x-admin-key': 'test-admin-key' }
    });
    return res.json() as Promise<OrderResponse>;
  };

  describe('checkout.session.completed', () => {
    it('should update order and create payment', async () => {
      const eventId = `evt_checkout_${Date.now()}`;
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `cs_${Date.now()}`,
            payment_intent: `pi_${Date.now()}`,
            amount_total: testOrderTotal,
            currency: 'jpy',
            metadata: { orderId: String(testOrderId) }
          }
        }
      };

      const res = await sendWebhook(event);
      const json = await res.json() as { ok: boolean; data?: { received: boolean } };

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data?.received).toBe(true);

      // Verify order updated
      const orderJson = await getOrder(testOrderId);
      expect(orderJson.data?.order.status).toBe('paid');
      expect(orderJson.data?.order.provider_payment_intent_id).toBe(event.data.object.payment_intent);
    });

    it('should handle duplicate events idempotently', async () => {
      const eventId = `evt_dup_${Date.now()}`;
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `cs_dup_${Date.now()}`,
            payment_intent: `pi_dup_${Date.now()}`,
            amount_total: testOrderTotal,
            currency: 'jpy',
            metadata: { orderId: String(testOrderId) }
          }
        }
      };

      // First request
      const res1 = await sendWebhook(event);
      expect(res1.status).toBe(200);

      // Second request with same event ID
      const res2 = await sendWebhook(event);
      const json2 = await res2.json() as { ok: boolean; data?: { duplicate?: boolean } };
      expect(res2.status).toBe(200);
      expect(json2.data?.duplicate).toBe(true);
    });
  });

  describe('refund events', () => {
    it('should update order to refunded for full refund', async () => {
      // Setup: ensure order is paid with a payment
      const checkoutEventId = `evt_checkout_refund_${Date.now()}`;
      const paymentIntentId = `pi_refund_${Date.now()}`;
      await sendWebhook({
        id: checkoutEventId,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `cs_refund_${Date.now()}`,
            payment_intent: paymentIntentId,
            amount_total: testOrderTotal,
            currency: 'jpy',
            metadata: { orderId: String(testOrderId) }
          }
        }
      });

      // Full refund
      const refundEvent = {
        id: `evt_refund_full_${Date.now()}`,
        type: 'refund.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `re_full_${Date.now()}`,
            amount: testOrderTotal,
            currency: 'jpy',
            payment_intent: paymentIntentId,
            metadata: { orderId: String(testOrderId) }
          }
        }
      };

      const res = await sendWebhook(refundEvent);
      expect(res.status).toBe(200);

      const orderJson = await getOrder(testOrderId);
      expect(orderJson.data?.order.status).toBe('refunded');
    });

    it('should update order to partially_refunded for partial refund', async () => {
      // Need a fresh order for this test - seed another one
      await worker.fetch('/dev/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orders: 1, payments: 0, refunds: 0, makeInbox: false })
      });

      const ordersRes = await worker.fetch('/admin/orders', {
        headers: { 'x-admin-key': 'test-admin-key' }
      });
      const ordersJson = await ordersRes.json() as { ok: boolean; data?: { orders: Array<{ id: number; status: string; total_net: number }> } };
      const orders = ordersJson.data?.orders || [];
      const paidOrders = orders.filter(o => o.status === 'paid');
      const partialOrder = paidOrders[paidOrders.length - 1];
      expect(partialOrder).toBeDefined();
      const partialOrderId = partialOrder.id;
      const partialOrderTotal = partialOrder.total_net;

      // Setup checkout
      const paymentIntentId = `pi_partial_${Date.now()}`;
      await sendWebhook({
        id: `evt_checkout_partial_${Date.now()}`,
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `cs_partial_${Date.now()}`,
            payment_intent: paymentIntentId,
            amount_total: partialOrderTotal,
            currency: 'jpy',
            metadata: { orderId: String(partialOrderId) }
          }
        }
      });

      // Partial refund (half the amount)
      const partialAmount = Math.floor(partialOrderTotal / 2);
      const refundEvent = {
        id: `evt_refund_partial_${Date.now()}`,
        type: 'refund.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `re_partial_${Date.now()}`,
            amount: partialAmount,
            currency: 'jpy',
            payment_intent: paymentIntentId,
            metadata: { orderId: String(partialOrderId) }
          }
        }
      };

      const res = await sendWebhook(refundEvent);
      expect(res.status).toBe(200);

      const orderJson = await getOrder(partialOrderId);
      expect(orderJson.data?.order.status).toBe('partially_refunded');
    });
  });

  describe('signature validation', () => {
    it('should reject invalid signature', async () => {
      const event = { id: 'evt_invalid_sig', type: 'test' };
      const res = await worker.fetch('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 't=123,v1=invalid'
        },
        body: JSON.stringify(event)
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing signature', async () => {
      const event = { id: 'evt_no_sig', type: 'test' };
      const res = await worker.fetch('/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event)
      });

      expect(res.status).toBe(400);
    });
  });
});
