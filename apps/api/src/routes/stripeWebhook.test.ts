import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe, { handleStripeEvent } from './stripe';
import { computeStripeSignature } from '../lib/stripe';

const createMockDb = (options?: { duplicatePayment?: boolean }) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT id FROM orders')) {
            return { id: 123 };
          }
          if (sql.includes('SELECT id FROM payments')) {
            return null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO payments') && options?.duplicatePayment) {
            throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
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
  });
});
