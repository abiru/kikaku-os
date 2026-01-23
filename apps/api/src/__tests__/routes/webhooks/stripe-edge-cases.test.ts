import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe from '../../../routes/stripe';
import { createMockDb, buildStripeSignatureHeader } from './stripe.test.utils';

describe('Stripe webhook route - Edge cases and error handling', () => {
  it('handles different event id with same provider_payment_id without duplicating payment', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 789;
    const firstPayload = JSON.stringify({
      id: 'evt_paid_idem_a',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_idem_a',
          payment_intent: 'pi_paid_idem',
          amount_total: 5000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });
    const secondPayload = JSON.stringify({
      id: 'evt_paid_idem_b',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_idem_b',
          payment_intent: 'pi_paid_idem',
          amount_total: 5000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });

    const secret = 'whsec_test';
    const firstHeader = await buildStripeSignatureHeader(firstPayload, secret);
    const secondHeader = await buildStripeSignatureHeader(secondPayload, secret);
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 5000, currency: 'JPY' }]
    });

    const first = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': firstHeader },
        body: firstPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const firstJson = await first.json();
    expect(first.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(db.state.payments).toHaveLength(1);
    const firstOrder = db.state.orders.get(orderId);
    const paidAt = firstOrder?.paid_at;
    expect(firstOrder?.provider_checkout_session_id).toBe('cs_paid_idem_a');
    expect(firstOrder?.provider_payment_intent_id).toBe('pi_paid_idem');

    const second = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': secondHeader },
        body: secondPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const secondJson = await second.json();
    expect(second.status).toBe(200);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.duplicate).toBe(true);
    expect(db.state.payments).toHaveLength(1);
    const secondOrder = db.state.orders.get(orderId);
    expect(secondOrder?.provider_checkout_session_id).toBe('cs_paid_idem_a');
    expect(secondOrder?.provider_payment_intent_id).toBe('pi_paid_idem');
    expect(secondOrder?.paid_at).toBe(paidAt);
    expect(db.state.events.size).toBe(2);
  });

  it('processes paid then refund events with idempotency and state updates', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const orderId = 777;
    const secret = 'whsec_test';
    const db = createMockDb({
      orders: [{ id: orderId, status: 'pending', total_net: 10000, currency: 'JPY' }]
    });

    const checkoutPayload = JSON.stringify({
      id: 'evt_paid_flow',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_flow',
          payment_intent: 'pi_paid_flow',
          amount_total: 10000,
          currency: 'jpy',
          metadata: { orderId: String(orderId) }
        }
      }
    });
    const checkoutHeader = await buildStripeSignatureHeader(checkoutPayload, secret);

    const paidFirst = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': checkoutHeader },
        body: checkoutPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const paidFirstJson = await paidFirst.json();
    expect(paidFirst.status).toBe(200);
    expect(paidFirstJson.ok).toBe(true);
    expect(db.state.events.size).toBe(1);
    expect(db.state.payments).toHaveLength(1);
    const paidOrder = db.state.orders.get(orderId);
    expect(paidOrder?.status).toBe('paid');
    expect(paidOrder?.paid_at).toBeTruthy();
    expect(paidOrder?.provider_checkout_session_id).toBe('cs_paid_flow');
    expect(paidOrder?.provider_payment_intent_id).toBe('pi_paid_flow');
    const paidAt = paidOrder?.paid_at;

    const paidSecond = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': checkoutHeader },
        body: checkoutPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );
    const paidSecondJson = await paidSecond.json();
    expect(paidSecond.status).toBe(200);
    expect(paidSecondJson.ok).toBe(true);
    expect(paidSecondJson.duplicate).toBe(true);
    expect(db.state.events.size).toBe(1);
    expect(db.state.payments).toHaveLength(1);
    expect(db.state.orders.get(orderId)?.paid_at).toBe(paidAt);

    const refundPayload = JSON.stringify({
      id: 'evt_refund_flow',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_flow_1',
          amount: 10000,
          currency: 'jpy',
          payment_intent: 'pi_paid_flow',
          metadata: { orderId: String(orderId) }
        }
      }
    });
    const refundHeader = await buildStripeSignatureHeader(refundPayload, secret);

    const refundFirst = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': refundHeader },
        body: refundPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const refundFirstJson = await refundFirst.json();
    expect(refundFirst.status).toBe(200);
    expect(refundFirstJson.ok).toBe(true);
    expect(db.state.refunds).toHaveLength(1);
    const refundRow = db.state.refunds[0];
    const paymentRow = db.state.payments[0];
    expect(refundRow.provider_refund_id).toBe('re_flow_1');
    expect(refundRow.payment_id).toBe(paymentRow.id);

    const refundSecond = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': refundHeader },
        body: refundPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );
    const refundSecondJson = await refundSecond.json();
    expect(refundSecond.status).toBe(200);
    expect(refundSecondJson.ok).toBe(true);
    expect(refundSecondJson.duplicate).toBe(true);
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.events.size).toBe(2);
  });

  it('stores full payload in stripe_events and updates status to completed', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_full_payload',
      type: 'checkout.session.completed',
      created: 1700000000,
      data: {
        object: {
          id: 'cs_test_full',
          payment_intent: 'pi_test_full',
          amount_total: 5000,
          currency: 'jpy',
          metadata: { orderId: '999' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      orders: [{ id: 999, status: 'pending', total_net: 5000, currency: 'JPY' }]
    });

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // stripe_eventsにフルペイロードが保存されていることを確認
    const stripeEvent = db.state.stripeEvents.get('evt_full_payload');
    expect(stripeEvent).toBeDefined();
    expect(stripeEvent?.event_id).toBe('evt_full_payload');
    expect(stripeEvent?.event_type).toBe('checkout.session.completed');
    expect(stripeEvent?.event_created).toBe(1700000000);
    expect(stripeEvent?.payload_json).toBe(payload);
    expect(stripeEvent?.processing_status).toBe('completed');
    expect(stripeEvent?.error).toBeNull();
    expect(stripeEvent?.processed_at).toBeTruthy();
  });

  it('records error in stripe_events when processing fails', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_will_fail',
      type: 'checkout.session.completed',
      created: 1700000001,
      data: {
        object: {
          id: 'cs_test_fail',
          payment_intent: 'pi_test_fail',
          amount_total: 3000,
          currency: 'jpy',
          metadata: { orderId: '888' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      orders: [{ id: 888, status: 'pending', total_net: 3000, currency: 'JPY' }]
    });

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    expect(res.status).toBe(200);
    const stripeEvent = db.state.stripeEvents.get('evt_will_fail');
    expect(stripeEvent?.processing_status).toBe('completed');
  });

  it('deduplicates via stripe_events.event_id unique constraint', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_dedup_test',
      type: 'checkout.session.completed',
      created: 1700000002,
      data: {
        object: {
          id: 'cs_dedup',
          payment_intent: 'pi_dedup',
          amount_total: 1000,
          currency: 'jpy',
          metadata: { orderId: '777' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      orders: [{ id: 777, status: 'pending', total_net: 1000, currency: 'JPY' }]
    });

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

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(firstJson.duplicate).toBeFalsy();
    expect(secondJson.duplicate).toBe(true);

    // stripe_eventsには1件のみ
    expect(db.state.stripeEvents.size).toBe(1);
    // eventsにも1件のみ
    expect(db.state.events.size).toBe(1);
    // paymentsにも1件のみ
    expect(db.state.payments).toHaveLength(1);
  });
});
