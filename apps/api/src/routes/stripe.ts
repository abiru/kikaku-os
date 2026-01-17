import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { verifyStripeSignature } from '../lib/stripe';

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: any };
};

const insertPayment = async (env: Env['Bindings'], payload: {
  orderId: number | null;
  amount: number;
  currency: string;
  providerPaymentId: string;
  eventId: string;
}) => {
  try {
    await env.DB.prepare(
      `INSERT INTO payments (order_id, status, amount, fee, currency, method, provider, provider_payment_id, metadata, created_at, updated_at)
       VALUES (?, 'succeeded', ?, 0, ?, 'card', 'stripe', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      payload.orderId,
      payload.amount,
      payload.currency,
      payload.providerPaymentId,
      JSON.stringify({ stripe_event: payload.eventId })
    ).run();
    return { inserted: true, duplicate: false };
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
};

export const handleStripeEvent = async (env: Env['Bindings'], event: StripeEvent) => {
  const type = event.type as string;
  const dataObject = event.data?.object || {};

  if (type === 'checkout.session.completed') {
    const orderId = Number(dataObject.metadata?.order_id);
    const sessionId = dataObject.id;
    const paymentIntentId = dataObject.payment_intent;
    const amount = dataObject.amount_total || dataObject.amount_subtotal || 0;
    const currency = (dataObject.currency || 'jpy').toUpperCase();

    if (!orderId || !paymentIntentId) {
      return { received: true, ignored: true };
    }

    const existingOrder = await env.DB.prepare(
      `SELECT id FROM orders WHERE id=?`
    ).bind(orderId).first<{ id: number }>();

    if (!existingOrder?.id) {
      return { received: true, ignored: true };
    }

    await env.DB.prepare(
      `UPDATE orders
       SET status='paid',
           provider_checkout_session_id=?,
           provider_payment_intent_id=?,
           updated_at=datetime('now')
       WHERE id=?`
    ).bind(sessionId, paymentIntentId, orderId).run();

    const paymentResult = await insertPayment(env, {
      orderId,
      amount,
      currency,
      providerPaymentId: paymentIntentId,
      eventId: event.id
    });

    return { received: true, duplicate: paymentResult.duplicate };
  }

  if (type === 'payment_intent.succeeded') {
    const providerPaymentId = dataObject.id;
    const amount = dataObject.amount_received || dataObject.amount || 0;
    const currency = (dataObject.currency || 'jpy').toUpperCase();
    const orderId = Number(dataObject.metadata?.order_id);

    if (orderId) {
      const existingOrder = await env.DB.prepare(
        `SELECT id FROM orders WHERE id=?`
      ).bind(orderId).first<{ id: number }>();

      if (!existingOrder?.id) {
        return { received: true, ignored: true };
      }

      await env.DB.prepare(
        `UPDATE orders
         SET status='paid',
             provider_payment_intent_id=?,
             updated_at=datetime('now')
         WHERE id=?`
      ).bind(providerPaymentId, orderId).run();

      const paymentResult = await insertPayment(env, {
        orderId,
        amount,
        currency,
        providerPaymentId,
        eventId: event.id
      });

      return { received: true, duplicate: paymentResult.duplicate };
    }
    return { received: true, ignored: true };
  }

  if (type === 'charge.refunded' || type === 'refund.succeeded') {
    const refundId = dataObject.object === 'refund'
      ? dataObject.id
      : dataObject.refunds?.data?.[0]?.id || dataObject.id;
    const amount = dataObject.amount || 0;
    const currency = (dataObject.currency || 'jpy').toUpperCase();
    const paymentIntentId = dataObject.payment_intent || dataObject.payment_intent_id;

    const existingRefund = await env.DB.prepare(
      `SELECT id FROM refunds WHERE provider_refund_id=?`
    ).bind(refundId).first<{ id: number }>();

    if (!existingRefund) {
      const paymentRow = paymentIntentId
        ? await env.DB.prepare(`SELECT id FROM payments WHERE provider_payment_id=?`).bind(paymentIntentId).first<{ id: number }>()
        : null;

      try {
        await env.DB.prepare(
          `INSERT INTO refunds (payment_id, status, amount, currency, reason, provider_refund_id, metadata, created_at, updated_at)
           VALUES (?, 'succeeded', ?, ?, 'stripe_refund', ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          paymentRow?.id || null,
          amount,
          currency,
          refundId,
          JSON.stringify({ stripe_event: event.id })
        ).run();
      } catch (err: any) {
        if (String(err?.message || '').includes('UNIQUE constraint failed')) {
          return { received: true, duplicate: true };
        }
        throw err;
      }
    }
  }

  return { received: true };
};

const stripe = new Hono<Env>();

stripe.post('/webhooks/stripe', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonError(c, 'Stripe webhook secret not configured', 500);

  const signature = c.req.header('stripe-signature');
  const payload = await c.req.text();
  const valid = await verifyStripeSignature(payload, signature, secret, { toleranceSeconds: 300 });
  if (!valid) return jsonError(c, 'Invalid signature', 400);

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonError(c, 'Invalid payload', 400);
  }

  try {
    const type = event.type as string;
    const result = await handleStripeEvent(c.env, event);

    await c.env.DB.prepare(
      `INSERT INTO events (type, payload, created_at) VALUES ('stripe_webhook', ?, datetime('now'))`
    ).bind(JSON.stringify({ id: event.id, type })).run();

    return jsonOk(c, result);
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to process webhook');
  }
});

export default stripe;
