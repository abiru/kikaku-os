/**
 * Stripe Webhook Integration Tests (Unit Test Version)
 *
 * Converted from integration tests (using wrangler unstable_dev) to unit tests
 * using the mock DB pattern for reliable CI execution without wrangler.
 *
 * Tests the full webhook flow: signature validation → event processing →
 * DB state changes (orders, payments, refunds, fulfillments).
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe from '../../../routes/webhooks/stripe';
import { handleStripeEvent } from '../../../services/stripeEventHandlers';
import { createMockDb, buildStripeSignatureHeader } from './stripe.test.utils';

const WEBHOOK_SECRET = 'whsec_test_secret';

describe('Stripe Webhook Integration - checkout.session.completed', () => {
  it('updates order to paid and creates payment record', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 100;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 2500, currency: 'JPY' }]
    });

    const payload = JSON.stringify({
      id: 'evt_checkout_int_1',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_int_1',
          payment_intent: 'pi_int_1',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);
    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // Verify order updated to paid
    const order = db.state.orders.get(orderId);
    expect(order?.status).toBe('paid');
    expect(order?.provider_payment_intent_id).toBe('pi_int_1');
    expect(order?.provider_checkout_session_id).toBe('cs_int_1');
    expect(order?.paid_at).toBeTruthy();

    // Verify payment created
    expect(db.state.payments).toHaveLength(1);
    expect(db.state.payments[0].order_id).toBe(orderId);
  });

  it('handles duplicate events idempotently', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 101;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 3000, currency: 'JPY' }]
    });

    const payload = JSON.stringify({
      id: 'evt_checkout_dup',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_dup',
          payment_intent: 'pi_dup',
          amount_total: 3000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);

    // First request
    const res1 = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );
    expect(res1.status).toBe(200);

    // Second request with same event ID
    const res2 = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );
    const json2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(json2.duplicate).toBe(true);

    // Only one payment created
    expect(db.state.payments).toHaveLength(1);
    // Only one event stored in stripe_events
    expect(db.state.stripeEvents.size).toBe(1);
  });
});

describe('Stripe Webhook Integration - Refund events', () => {
  it('updates order to refunded for full refund', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 200;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'paid', total_net: 5000, currency: 'JPY' }],
      existingPayments: [{ providerPaymentId: 'pi_refund_full', orderId }]
    });

    const payload = JSON.stringify({
      id: 'evt_refund_full_int',
      type: 'refund.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 're_full_int',
          amount: 5000,
          currency: 'jpy',
          payment_intent: 'pi_refund_full',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);
    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Verify refund was created
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.refunds[0].provider_refund_id).toBe('re_full_int');
    expect(db.state.refunds[0].amount).toBe(5000);

    // Verify order status updated
    const order = db.state.orders.get(orderId);
    expect(order?.status).toBe('refunded');
  });

  it('updates order to partially_refunded for partial refund', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 201;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'paid', total_net: 10000, currency: 'JPY' }],
      existingPayments: [{ providerPaymentId: 'pi_refund_partial', orderId }]
    });

    const payload = JSON.stringify({
      id: 'evt_refund_partial_int',
      type: 'refund.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 're_partial_int',
          amount: 3000,
          currency: 'jpy',
          payment_intent: 'pi_refund_partial',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);
    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(res.status).toBe(200);

    // Verify partial refund
    const order = db.state.orders.get(orderId);
    expect(order?.status).toBe('partially_refunded');
    expect(order?.refunded_amount).toBe(3000);
  });

  it('handles duplicate refund events idempotently', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 202;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'paid', total_net: 5000, currency: 'JPY' }],
      existingPayments: [{ providerPaymentId: 'pi_refund_idem', orderId }]
    });

    const payload = JSON.stringify({
      id: 'evt_refund_idem',
      type: 'refund.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 're_idem',
          amount: 5000,
          currency: 'jpy',
          payment_intent: 'pi_refund_idem',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);

    // First refund
    await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    // Second refund (duplicate)
    const res2 = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    const json2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(json2.duplicate).toBe(true);

    // Only one refund created
    expect(db.state.refunds).toHaveLength(1);
  });
});

describe('Stripe Webhook Integration - Signature validation', () => {
  it('rejects invalid signature', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'stripe-signature': 't=123,v1=invalid_signature',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ id: 'evt_invalid_sig', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(res.status).toBe(400);
  });

  it('rejects missing signature header', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'evt_no_sig', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(res.status).toBe(400);
  });

  it('rejects when webhook secret is not configured', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        body: '{}'
      },
      { DB: createMockDb() } as any
    );

    expect(res.status).toBe(500);
  });
});

describe('Stripe Webhook Integration - Event type handling', () => {
  it('handles payment_intent.succeeded with orderId', async () => {
    const orderId = 300;
    const mockDb = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 2000, currency: 'JPY' }]
    });

    const event = {
      id: 'evt_pi_success',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_success',
          amount: 2000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(result.received).toBe(true);

    // Order should be updated to paid
    const order = mockDb.state.orders.get(orderId);
    expect(order?.status).toBe('paid');
  });

  it('ignores payment_intent.succeeded without orderId', async () => {
    const mockDb = createMockDb();

    const event = {
      id: 'evt_pi_no_order',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_order',
          amount: 1000,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
  });

  it('handles payment_intent.payment_failed', async () => {
    const orderId = 301;
    const mockDb = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 3000, currency: 'JPY' }]
    });

    const event = {
      id: 'evt_pi_failed_int',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_failed_int',
          metadata: { orderId: String(orderId) },
          last_payment_error: {
            code: 'card_declined',
            message: 'Your card was declined.'
          }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(result.received).toBe(true);

    // Order should be marked as payment_failed
    const order = mockDb.state.orders.get(orderId);
    expect(order?.status).toBe('payment_failed');

    // Should create inbox item for the failure
    const inboxInserts = mockDb.calls.filter((call) =>
      call.sql.includes('INSERT INTO inbox_items')
    );
    expect(inboxInserts.length).toBeGreaterThan(0);
  });

  it('records event in stripe_events table with full payload', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 302;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 4000, currency: 'JPY' }]
    });

    const payload = JSON.stringify({
      id: 'evt_tracking_test',
      type: 'checkout.session.completed',
      created: 1700000000,
      data: {
        object: {
          id: 'cs_tracking',
          payment_intent: 'pi_tracking',
          amount_total: 4000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const header = await buildStripeSignatureHeader(payload, WEBHOOK_SECRET);
    await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    const stripeEvent = db.state.stripeEvents.get('evt_tracking_test');
    expect(stripeEvent).toBeDefined();
    expect(stripeEvent?.event_type).toBe('checkout.session.completed');
    expect(stripeEvent?.event_created).toBe(1700000000);
    expect(stripeEvent?.payload_json).toBe(payload);
    expect(stripeEvent?.processing_status).toBe('completed');
  });

  it('records order status history on state transitions', async () => {
    const orderId = 303;
    const mockDb = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 1500, currency: 'JPY' }]
    });

    const event = {
      id: 'evt_status_history',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_history',
          metadata: { orderId: String(orderId) },
          last_payment_error: {
            code: 'insufficient_funds',
            message: 'Insufficient funds'
          }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const historyInserts = mockDb.calls.filter((call) =>
      call.sql.includes('INSERT INTO order_status_history')
    );
    expect(historyInserts.length).toBeGreaterThan(0);

    // Verify the status history was recorded
    expect(mockDb.state.orderStatusHistory).toHaveLength(1);
    expect(mockDb.state.orderStatusHistory[0].old_status).toBe('pending');
    expect(mockDb.state.orderStatusHistory[0].new_status).toBe('payment_failed');
  });
});

describe('Stripe Webhook Integration - Full payment→refund flow', () => {
  it('processes checkout then full refund in sequence', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 400;
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 8000, currency: 'JPY' }]
    });

    // Step 1: Checkout completed
    const checkoutPayload = JSON.stringify({
      id: 'evt_flow_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_flow',
          payment_intent: 'pi_flow',
          amount_total: 8000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const checkoutHeader = await buildStripeSignatureHeader(checkoutPayload, WEBHOOK_SECRET);
    const checkoutRes = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': checkoutHeader },
        body: checkoutPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(checkoutRes.status).toBe(200);
    expect(db.state.orders.get(orderId)?.status).toBe('paid');
    expect(db.state.payments).toHaveLength(1);

    // Step 2: Full refund
    const refundPayload = JSON.stringify({
      id: 'evt_flow_refund',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_flow',
          amount: 8000,
          currency: 'jpy',
          payment_intent: 'pi_flow',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const refundHeader = await buildStripeSignatureHeader(refundPayload, WEBHOOK_SECRET);
    const refundRes = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': refundHeader },
        body: refundPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as any
    );

    expect(refundRes.status).toBe(200);

    // Verify final state
    const order = db.state.orders.get(orderId);
    expect(order?.status).toBe('refunded');
    expect(order?.refunded_amount).toBe(8000);
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.events.size).toBe(2);
    expect(db.state.stripeEvents.size).toBe(2);
  });
});
