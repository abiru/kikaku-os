import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { verifyStripeSignature } from '../lib/stripe';

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: any };
};

const normalizeOrderId = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const extractOrderId = (metadata: any) =>
  normalizeOrderId(metadata?.orderId ?? metadata?.order_id);

const recordStripeEvent = async (env: Env['Bindings'], event: StripeEvent) => {
  try {
    await env.DB.prepare(
      `INSERT INTO events (type, payload, stripe_event_id, created_at)
       VALUES ('stripe_webhook', ?, ?, datetime('now'))`
    ).bind(
      JSON.stringify({ id: event.id, type: event.type }),
      event.id
    ).run();
    return { inserted: true, duplicate: false };
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
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
    const orderId = extractOrderId(dataObject.metadata);
    const sessionId = dataObject.id;
    const paymentIntentId = dataObject.payment_intent;
    const amount = dataObject.amount_total || dataObject.amount_subtotal || 0;
    const currency = (dataObject.currency || 'jpy').toUpperCase();

    if (!orderId) {
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
           provider_checkout_session_id=COALESCE(provider_checkout_session_id, ?),
           provider_payment_intent_id=COALESCE(provider_payment_intent_id, ?),
           paid_at=COALESCE(paid_at, datetime('now')),
           updated_at=datetime('now')
       WHERE id=?`
    ).bind(sessionId, paymentIntentId ?? null, orderId).run();

    const existingFulfillment = await env.DB.prepare(
      `SELECT id FROM fulfillments WHERE order_id=?`
    ).bind(orderId).first<{ id: number }>();

    if (!existingFulfillment?.id) {
      await env.DB.prepare(
        `INSERT INTO fulfillments (order_id, status, metadata, created_at, updated_at)
         VALUES (?, 'pending', ?, datetime('now'), datetime('now'))`
      ).bind(
        orderId,
        JSON.stringify({
          stripe_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId ?? null,
          stripe_event_id: event.id
        })
      ).run();
    }

    let paymentResult: { inserted: boolean; duplicate: boolean } | null = null;
    if (paymentIntentId) {
      paymentResult = await insertPayment(env, {
        orderId,
        amount,
        currency,
        providerPaymentId: paymentIntentId,
        eventId: event.id
      });
    }

    return { received: true, duplicate: paymentResult?.duplicate };
  }

  if (type === 'payment_intent.succeeded') {
    const providerPaymentId = dataObject.id;
    const amount = dataObject.amount_received || dataObject.amount || 0;
    const currency = (dataObject.currency || 'jpy').toUpperCase();
    const orderId = extractOrderId(dataObject.metadata);

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
             provider_payment_intent_id=COALESCE(provider_payment_intent_id, ?),
             paid_at=COALESCE(paid_at, datetime('now')),
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

  if (type === 'charge.refunded' || type === 'refund.updated' || type === 'refund.succeeded') {
    const refunds = type === 'charge.refunded'
      ? Array.isArray(dataObject.refunds?.data)
        ? dataObject.refunds.data
        : []
      : dataObject?.id
        ? [dataObject]
        : [];
    let sawDuplicate = false;

    for (const refund of refunds) {
      const refundId = refund?.id;
      if (!refundId) continue;
      const amount = refund?.amount || dataObject?.amount_refunded || dataObject?.amount || 0;
      const currency = ((refund?.currency || dataObject?.currency || 'jpy') as string).toUpperCase();
      const paymentIntentId = refund?.payment_intent || refund?.payment_intent_id || dataObject?.payment_intent || dataObject?.payment_intent_id;
      const metadata = refund?.metadata ?? dataObject?.metadata;
      const metadataOrderId = extractOrderId(metadata);

      const existingRefund = await env.DB.prepare(
        `SELECT id FROM refunds WHERE provider_refund_id=?`
      ).bind(refundId).first<{ id: number }>();

      if (existingRefund?.id) {
        sawDuplicate = true;
        continue;
      }

      const paymentByIntent = paymentIntentId
        ? await env.DB.prepare(
          `SELECT id, order_id FROM payments WHERE provider_payment_id=?`
        ).bind(paymentIntentId).first<{ id: number; order_id: number | null }>()
        : null;

      const paymentRow = paymentByIntent?.id
        ? paymentByIntent
        : metadataOrderId
          ? await env.DB.prepare(
            `SELECT id, order_id FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1`
          ).bind(metadataOrderId).first<{ id: number; order_id: number | null }>()
          : null;

      const resolvedOrderId = metadataOrderId ?? paymentRow?.order_id ?? null;

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
          sawDuplicate = true;
          continue;
        }
        throw err;
      }

      if (resolvedOrderId) {
        const orderRow = await env.DB.prepare(
          `SELECT id, total_net, status FROM orders WHERE id=?`
        ).bind(resolvedOrderId).first<{ id: number; total_net: number; status: string }>();

        if (orderRow?.id && orderRow.status === 'paid' && amount >= (orderRow.total_net || 0)) {
          await env.DB.prepare(
            `UPDATE orders SET status='refunded', updated_at=datetime('now') WHERE id=?`
          ).bind(orderRow.id).run();
        }
      }
    }

    return { received: true, duplicate: sawDuplicate };
  }

  return { received: true };
};

const stripe = new Hono<Env>();

const handleWebhook = async (c: Context<Env>) => {
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
  if (!event?.id || typeof event.id !== 'string') {
    return jsonError(c, 'Invalid payload', 400);
  }

  try {
    const recorded = await recordStripeEvent(c.env, event);
    if (recorded.duplicate) {
      return jsonOk(c, { received: true, duplicate: true });
    }

    const result = await handleStripeEvent(c.env, event);
    return jsonOk(c, result);
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to process webhook');
  }
};

stripe.post('/webhooks/stripe', handleWebhook);
stripe.post('/stripe/webhook', handleWebhook);

export default stripe;
