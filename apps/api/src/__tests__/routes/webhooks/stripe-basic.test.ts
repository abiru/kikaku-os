import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe from '../../../routes/webhooks/stripe';
import { handleStripeEvent } from '../../../services/stripeEventHandlers';
import { computeStripeSignature } from '../../../lib/stripe';
import { createMockDb, buildStripeSignatureHeader } from './stripe.test.utils';

describe('Stripe webhook handling - Basic payment workflow', () => {
  it('handles checkout.session.completed and inserts payment', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_intent: 'pi_test_123',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { orderId: '123' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const updateCall = mockDb.calls.find((call) => call.sql.includes('UPDATE orders'));
    const insertCall = mockDb.calls.find((call) => call.sql.includes('INSERT INTO payments'));
    expect(updateCall?.bind[0]).toBe('cs_test_123');
    expect(updateCall?.bind[1]).toBe('pi_test_123');
    expect(updateCall?.bind[2]).toBe(123);
    expect(insertCall?.bind[0]).toBe(123);
    expect(insertCall?.bind[3]).toBe('card'); // Payment method
    expect(insertCall?.bind[4]).toBe('pi_test_123'); // Provider payment ID
  });

  it('returns duplicate when payment insert hits unique constraint', async () => {
    const mockDb = createMockDb({ duplicatePayment: true });
    const event = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_dup',
          payment_intent: 'pi_test_dup',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { order_id: '123' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(result.received).toBe(true);
    expect(result.duplicate).toBe(true);
  });

  it('creates a fulfillment once for repeated checkout.session.completed', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_fulfillment',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fulfillment',
          payment_intent: null,
          amount_total: 2500,
          currency: 'jpy',
          metadata: { orderId: '123' }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);
    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const fulfillmentInserts = mockDb.calls.filter((call) =>
      call.sql.includes('INSERT INTO fulfillments')
    );
    expect(fulfillmentInserts).toHaveLength(1);
  });

  it('ignores payment_intent.succeeded without orderId', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_no_order',
          amount: 1200,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
    const orderInsert = mockDb.calls.find((call) => call.sql.includes('INSERT INTO orders'));
    expect(orderInsert).toBeUndefined();
  });

  it('handles payment_intent.payment_failed and marks pending order as payment_failed', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 123, status: 'pending', total_net: 2500, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_pi_failed',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_test_failed',
          metadata: { orderId: '123' },
          last_payment_error: {
            code: 'card_declined',
            message: 'Your card was declined.'
          }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(mockDb.state.orders.get(123)?.status).toBe('payment_failed');
    expect(
      mockDb.calls.some((call) => call.sql.includes("UPDATE orders") && call.bind[0] === 'payment_failed')
    ).toBe(true);
    expect(mockDb.calls.some((call) => call.sql.includes('INSERT INTO order_status_history'))).toBe(true);
    expect(mockDb.calls.some((call) => call.sql.includes('INSERT INTO inbox_items'))).toBe(true);
  });
});

describe('Stripe webhook route - Basic validation and operations', () => {
  it('returns 500 when webhook secret is not configured', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      { method: 'POST', body: '{}' },
      { DB: createMockDb() } as any
    );

    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toBe('STRIPE_WEBHOOK_SECRET is not configured');
  });

  it('returns 400 for invalid signature', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=bad' },
        body: '{"id":"evt_test"}'
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_test' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('accepts valid webhook and updates order', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_intent: 'pi_test_123',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { orderId: '123' }
        }
      }
    });

    const secret = 'whsec_test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const db = createMockDb();

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    const updateCall = db.calls.find((call) => call.sql.includes('UPDATE orders'));
    expect(updateCall?.bind[0]).toBe('cs_test_123');
    expect(updateCall?.bind[1]).toBe('pi_test_123');
    expect(updateCall?.bind[2]).toBe(123);
    const eventInsert = db.calls.find((call) => call.sql.includes('INSERT INTO events'));
    expect(eventInsert?.bind[1]).toBe('evt_123');
    const paymentInsert = db.calls.find((call) => call.sql.includes('INSERT INTO payments'));
    expect(paymentInsert).toBeDefined();
  });

  it('treats duplicate checkout events as already processed', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_idem_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_idem',
          payment_intent: 'pi_test_idem',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { orderId: '123' }
        }
      }
    });

    const secret = 'whsec_test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const db = createMockDb();

    const first = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const second = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.duplicate).toBe(true);
    const paymentInserts = db.calls.filter((call) => call.sql.includes('INSERT INTO payments'));
    expect(paymentInserts).toHaveLength(1);
  });
});
