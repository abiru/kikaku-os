import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import stripe from '../../../routes/webhooks/stripe';
import { createMockDb, buildStripeSignatureHeader } from './stripe.test.utils';

describe('Stripe webhook route - Security: Signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_missing_sig', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_test' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('returns 400 when stripe-signature header is empty string', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': '' },
        body: JSON.stringify({ id: 'evt_empty_sig', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_test' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('returns 400 when signature is computed with wrong secret', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_wrong_secret',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_wrong', metadata: {} } }
    });

    const wrongSecretHeader = await buildStripeSignatureHeader(payload, 'whsec_wrong_secret');

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': wrongSecretHeader },
        body: payload
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_correct_secret' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('returns 400 for malformed signature header (no v1 component)', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 't=1234567890' },
        body: JSON.stringify({ id: 'evt_no_v1', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_test' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('returns 400 for malformed signature header (no timestamp)', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'v1=abc123' },
        body: JSON.stringify({ id: 'evt_no_ts', type: 'test' })
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: 'whsec_test' } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid signature');
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': 't=123,v1=abc' },
        body: JSON.stringify({ id: 'evt_no_secret', type: 'test' })
      },
      { DB: createMockDb() } as any
    );

    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toBe('STRIPE_WEBHOOK_SECRET is not configured');
  });
});

describe('Stripe webhook route - Security: Payload validation', () => {
  it('returns 400 for non-JSON payload', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = 'this is not json';
    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid payload');
  });

  it('returns 400 when event.id is missing', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({ type: 'checkout.session.completed', data: {} });
    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid payload');
  });

  it('returns 400 when event.id is not a string', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({ id: 12345, type: 'test', data: {} });
    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);

    const res = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': header },
        body: payload
      },
      { DB: createMockDb(), STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toBe('Invalid payload');
  });
});

describe('Stripe webhook route - Idempotency: duplicate event processing', () => {
  it('does not duplicate processing when same event ID is sent twice', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_idempotent_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_idempotent',
          payment_intent: 'pi_idempotent',
          amount_total: 3000,
          currency: 'jpy',
          metadata: { orderId: '500' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb({
      orders: [{ id: 500, status: 'pending', total_net: 3000, currency: 'JPY' }]
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

    const third = await app.request(
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
    const thirdJson = await third.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(firstJson.duplicate).toBeFalsy();
    expect(secondJson.duplicate).toBe(true);
    expect(thirdJson.duplicate).toBe(true);

    // Only one payment should be created
    expect(db.state.payments).toHaveLength(1);
    // Only one stripe_event record
    expect(db.state.stripeEvents.size).toBe(1);
  });

  it('processes different events for same order independently', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const secret = 'whsec_test';
    const db = createMockDb({
      orders: [{ id: 600, status: 'pending', total_net: 5000, currency: 'JPY' }]
    });

    const checkoutPayload = JSON.stringify({
      id: 'evt_checkout_600',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_600',
          payment_intent: 'pi_600',
          amount_total: 5000,
          currency: 'jpy',
          metadata: { orderId: '600' }
        }
      }
    });

    const piPayload = JSON.stringify({
      id: 'evt_pi_600',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_600',
          amount: 5000,
          amount_received: 5000,
          currency: 'jpy',
          metadata: { orderId: '600' }
        }
      }
    });

    const checkoutHeader = await buildStripeSignatureHeader(checkoutPayload, secret);
    const piHeader = await buildStripeSignatureHeader(piPayload, secret);

    const first = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': checkoutHeader },
        body: checkoutPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    const second = await app.request(
      'http://localhost/stripe/webhook',
      {
        method: 'POST',
        headers: { 'stripe-signature': piHeader },
        body: piPayload
      },
      { DB: db, STRIPE_WEBHOOK_SECRET: secret } as any
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(firstJson.duplicate).toBeFalsy();
    // Second event is a different event ID, so not duplicate at event level
    // but the payment insert may be duplicate since same pi_600
    expect(secondJson.ok).toBe(true);
    // Both events should be recorded in stripe_events
    expect(db.state.stripeEvents.size).toBe(2);
    expect(db.state.events.size).toBe(2);
  });
});

describe('Stripe webhook route - Both endpoint paths', () => {
  it('accepts webhooks at /webhooks/stripe', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_path_webhooks',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_path_1',
          payment_intent: 'pi_path_1',
          amount_total: 1000,
          currency: 'jpy',
          metadata: { orderId: '700' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
    const db = createMockDb();

    const res = await app.request(
      'http://localhost/webhooks/stripe',
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
  });

  it('accepts webhooks at /stripe/webhook', async () => {
    const app = new Hono();
    app.route('/', stripe);

    const payload = JSON.stringify({
      id: 'evt_path_stripe',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_path_2',
          payment_intent: 'pi_path_2',
          amount_total: 1000,
          currency: 'jpy',
          metadata: { orderId: '701' }
        }
      }
    });

    const secret = 'whsec_test';
    const header = await buildStripeSignatureHeader(payload, secret);
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

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
