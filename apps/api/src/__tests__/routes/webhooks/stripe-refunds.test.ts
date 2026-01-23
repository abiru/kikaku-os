import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe from '../../../routes/stripe';
import { handleStripeEvent } from '../../../services/stripeEventHandlers';
import { createMockDb, buildStripeSignatureHeader } from './stripe.test.utils';

describe('Stripe webhook handling - Refund events', () => {
  it('handles refund.updated and inserts refund', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_123', orderId: 123 }]
    });
    const event = {
      id: 'evt_refund',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_123',
          amount: 2500,
          currency: 'jpy',
          payment_intent: 'pi_refund_123',
          metadata: { orderId: '123' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const refundInsert = mockDb.calls.find((call) => call.sql.includes('INSERT INTO refunds'));
    expect(refundInsert?.bind[3]).toBe('re_123');
    expect(refundInsert?.bind[1]).toBe(2500);
    const statusUpdate = mockDb.calls.find((call) =>
      call.sql.includes('UPDATE orders SET status=?')
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate?.bind[0]).toBe('refunded');
  });
});

describe('Stripe webhook route - Refund operations', () => {
  it('accepts refund.updated and is idempotent', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_refund_route',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_route_123',
          amount: 2500,
          currency: 'jpy',
          payment_intent: 'pi_refund_route',
          metadata: { orderId: '123' }
        }
      }
    });

    const secret = 'whsec_test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_route', orderId: 123 }]
    });

    const first = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': sig },
        body: payload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const second = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': sig },
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
    const refundInserts = db.calls.filter((call) => call.sql.includes('INSERT INTO refunds'));
    expect(refundInserts).toHaveLength(1);
  });

  it('accepts refund.succeeded and is idempotent', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_refund_succeeded',
      type: 'refund.succeeded',
      data: {
        object: {
          id: 're_succeeded_123',
          amount: 2500,
          currency: 'jpy',
          payment_intent: 'pi_refund_succeeded',
          metadata: { orderId: '123' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_succeeded', orderId: 123 }],
      orders: [{ id: 123, status: 'paid', total_net: 2500, currency: 'JPY' }]
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

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.duplicate).toBe(true);
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.events.size).toBe(1);
    expect(db.state.orders.get(123)?.status).toBe('refunded');
  });

  it('accepts charge.refunded and is idempotent', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_charge_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          amount_refunded: 2500,
          currency: 'jpy',
          payment_intent: 'pi_charge_refunded',
          refunds: {
            data: [
              {
                id: 're_charge_123',
                amount: 2500,
                currency: 'jpy',
                payment_intent: 'pi_charge_refunded',
                metadata: { orderId: '123' }
              }
            ]
          },
          metadata: { orderId: '123' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_charge_refunded', orderId: 123 }],
      orders: [{ id: 123, status: 'paid', total_net: 2500, currency: 'JPY' }]
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

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(secondJson.ok).toBe(true);
    expect(secondJson.duplicate).toBe(true);
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.events.size).toBe(1);
    expect(db.state.orders.get(123)?.status).toBe('refunded');
  });

  it('handles different event id with same provider_refund_id without duplicating refund', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const baseRefund = {
      id: 're_same_provider_refund',
      amount: 2500,
      currency: 'jpy',
      payment_intent: 'pi_refund_dupe',
      metadata: { orderId: '456' }
    };

    const firstPayload = JSON.stringify({
      id: 'evt_refund_dupe_a',
      type: 'refund.updated',
      data: { object: baseRefund }
    });
    const secondPayload = JSON.stringify({
      id: 'evt_refund_dupe_b',
      type: 'refund.updated',
      data: { object: baseRefund }
    });

    const secret = 'whsec_test';
    const firstHeader = await buildStripeSignatureHeader(firstPayload, secret);
    const secondHeader = await buildStripeSignatureHeader(secondPayload, secret);
    const db = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_dupe', orderId: 456 }],
      orders: [{ id: 456, status: 'paid', total_net: 2500, currency: 'JPY' }]
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

    const second = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': secondHeader },
        body: secondPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(secondJson.ok).toBe(true);
    expect(firstJson.duplicate ?? false).toBe(false);
    expect(secondJson.duplicate).toBe(true);
    expect(db.state.refunds).toHaveLength(1);
    expect(db.state.events.size).toBe(2);
    expect(db.state.orders.get(456)?.status).toBe('refunded');
  });
});
