import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe, { handleStripeEvent } from './stripe';
import { computeStripeSignature } from '../lib/stripe';

type MockDbOptions = {
  duplicatePayment?: boolean;
  duplicateRefund?: boolean;
  existingPayments?: Array<{ providerPaymentId: string; id?: number; orderId?: number | null }>;
  orderStatus?: string;
  orderTotal?: number;
};

const createMockDb = (options?: MockDbOptions) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const fulfillments = new Map<number, number>();
  const payments = new Map<string, { id: number; order_id: number | null }>();
  const refunds = new Set<string>();
  const events = new Set<string>();
  let fulfillmentId = 0;
  let paymentId = 1000;
  const orderStatus = options?.orderStatus ?? 'paid';
  const orderTotal = options?.orderTotal ?? 2500;

  for (const payment of options?.existingPayments ?? []) {
    const id = payment.id ?? ++paymentId;
    payments.set(payment.providerPaymentId, { id, order_id: payment.orderId ?? null });
  }

  const findPaymentByOrderId = (orderId: number) => {
    for (const payment of payments.values()) {
      if (payment.order_id === orderId) return payment;
    }
    return null;
  };

  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT id, total_net, status FROM orders')) {
            const id = Number(args[0]);
            return Number.isFinite(id) ? { id, total_net: orderTotal, status: orderStatus } : null;
          }
          if (sql.includes('SELECT id FROM orders')) {
            const id = Number(args[0]);
            return Number.isFinite(id) ? { id } : null;
          }
          if (sql.includes('SELECT id, order_id FROM payments WHERE provider_payment_id')) {
            const payment = payments.get(String(args[0]));
            return payment ? { id: payment.id, order_id: payment.order_id } : null;
          }
          if (sql.includes('SELECT id, order_id FROM payments WHERE order_id')) {
            const payment = findPaymentByOrderId(Number(args[0]));
            return payment ? { id: payment.id, order_id: payment.order_id } : null;
          }
          if (sql.includes('SELECT id FROM payments WHERE provider_payment_id')) {
            const payment = payments.get(String(args[0]));
            return payment ? { id: payment.id } : null;
          }
          if (sql.includes('SELECT id FROM refunds')) {
            return refunds.has(String(args[0])) ? { id: 1 } : null;
          }
          if (sql.includes('SELECT id FROM fulfillments')) {
            const orderId = Number(args[0]);
            const existingId = fulfillments.get(orderId);
            return existingId ? { id: existingId } : null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO events')) {
            const eventId = String(args[1]);
            if (events.has(eventId)) {
              throw new Error('UNIQUE constraint failed: events.stripe_event_id');
            }
            events.add(eventId);
          }
          if (sql.includes('INSERT INTO payments') && options?.duplicatePayment) {
            throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
          }
          if (sql.includes('INSERT INTO payments')) {
            const providerPaymentId = String(args[3]);
            if (payments.has(providerPaymentId)) {
              throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
            }
            paymentId += 1;
            payments.set(providerPaymentId, { id: paymentId, order_id: Number(args[0]) || null });
          }
          if (sql.includes('INSERT INTO refunds')) {
            const refundId = String(args[4]);
            if (options?.duplicateRefund || refunds.has(refundId)) {
              throw new Error('UNIQUE constraint failed: refunds.provider_refund_id');
            }
            refunds.add(refundId);
          }
          if (sql.includes('INSERT INTO fulfillments')) {
            const orderId = Number(args[0]);
            if (!fulfillments.has(orderId)) {
              fulfillmentId += 1;
              fulfillments.set(orderId, fulfillmentId);
            }
          }
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

describe('Stripe webhook handling', () => {
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
    expect(insertCall?.bind[3]).toBe('pi_test_123');
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
      call.sql.includes("UPDATE orders SET status='refunded'")
    );
    expect(statusUpdate).toBeDefined();
  });
});

describe('Stripe webhook route', () => {
  it('returns 500 when webhook secret missing', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      { method: 'POST', body: '{}' },
      { DB: createMockDb() } as any
    );

    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toBe('Stripe webhook secret not configured');
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
    const sig = await computeStripeSignature(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;
    const db = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_route', orderId: 123 }]
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
    const refundInserts = db.calls.filter((call) => call.sql.includes('INSERT INTO refunds'));
    expect(refundInserts).toHaveLength(1);
  });
});
