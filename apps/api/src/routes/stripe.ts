import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { verifyStripeSignature } from '../lib/stripe';
import { calculateOrderStatus, getStatusChangeReason } from '../services/orderStatus';
import { sendOrderConfirmationEmail } from '../services/orderEmail';

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data?: { object?: any };
};

const normalizeOrderId = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const extractOrderId = (metadata: any) =>
  normalizeOrderId(metadata?.orderId ?? metadata?.order_id);

const recordStripeEvent = async (env: Env['Bindings'], event: StripeEvent, rawPayload: string) => {
  try {
    // Phase 1: stripe_eventsに完全なペイロードを保存（冪等性チェックの核）
    await env.DB.prepare(
      `INSERT INTO stripe_events (event_id, event_type, event_created, payload_json, processing_status, received_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
    ).bind(
      event.id,
      event.type,
      event.created ?? null,
      rawPayload
    ).run();

    // eventsテーブルにも簡易記録（監査ログとして）
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

const updateStripeEventStatus = async (
  env: Env['Bindings'],
  eventId: string,
  status: 'completed' | 'failed',
  error?: string
) => {
  await env.DB.prepare(
    `UPDATE stripe_events
     SET processing_status = ?, error = ?, processed_at = datetime('now')
     WHERE event_id = ?`
  ).bind(status, error ?? null, eventId).run();
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

// Handler result type for consistency
type HandlerResult = {
  received: true;
  ignored?: boolean;
  duplicate?: boolean;
};

// --- Checkout Session Handler ---

const handleCheckoutSessionCompleted = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: any
): Promise<HandlerResult> => {
  const orderId = extractOrderId(dataObject.metadata);
  if (!orderId) {
    return { received: true, ignored: true };
  }

  const existingOrder = await env.DB.prepare(
    `SELECT id FROM orders WHERE id=?`
  ).bind(orderId).first<{ id: number }>();

  if (!existingOrder?.id) {
    return { received: true, ignored: true };
  }

  const sessionId = dataObject.id;
  const paymentIntentId = dataObject.payment_intent;

  await updateOrderToPaid(env, orderId, sessionId, paymentIntentId);
  await ensureFulfillmentExists(env, orderId, sessionId, paymentIntentId, event.id);

  const paymentResult = paymentIntentId
    ? await insertPayment(env, {
        orderId,
        amount: dataObject.amount_total || dataObject.amount_subtotal || 0,
        currency: (dataObject.currency || 'jpy').toUpperCase(),
        providerPaymentId: paymentIntentId,
        eventId: event.id
      })
    : null;

  // Send order confirmation email (non-blocking)
  if (!paymentResult?.duplicate) {
    sendOrderConfirmationEmail(env, orderId).catch((err) => {
      console.error('Failed to send order confirmation email:', err);
    });
  }

  return { received: true, duplicate: paymentResult?.duplicate };
};

const updateOrderToPaid = async (
  env: Env['Bindings'],
  orderId: number,
  sessionId: string,
  paymentIntentId: string | null
) => {
  await env.DB.prepare(
    `UPDATE orders
     SET status='paid',
         provider_checkout_session_id=COALESCE(provider_checkout_session_id, ?),
         provider_payment_intent_id=COALESCE(provider_payment_intent_id, ?),
         paid_at=COALESCE(paid_at, datetime('now')),
         updated_at=datetime('now')
     WHERE id=?`
  ).bind(sessionId, paymentIntentId ?? null, orderId).run();
};

const ensureFulfillmentExists = async (
  env: Env['Bindings'],
  orderId: number,
  sessionId: string,
  paymentIntentId: string | null,
  eventId: string
) => {
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
        stripe_event_id: eventId
      })
    ).run();
  }
};

// --- Payment Intent Handler ---

const handlePaymentIntentSucceeded = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: any
): Promise<HandlerResult> => {
  const orderId = extractOrderId(dataObject.metadata);
  if (!orderId) {
    return { received: true, ignored: true };
  }

  const existingOrder = await env.DB.prepare(
    `SELECT id FROM orders WHERE id=?`
  ).bind(orderId).first<{ id: number }>();

  if (!existingOrder?.id) {
    return { received: true, ignored: true };
  }

  const providerPaymentId = dataObject.id;

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
    amount: dataObject.amount_received || dataObject.amount || 0,
    currency: (dataObject.currency || 'jpy').toUpperCase(),
    providerPaymentId,
    eventId: event.id
  });

  return { received: true, duplicate: paymentResult.duplicate };
};

// --- Refund Handlers ---

type RefundData = {
  refundId: string;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  metadataOrderId: number | null;
};

const extractRefundsFromEvent = (eventType: string, dataObject: any): RefundData[] => {
  const rawRefunds = eventType === 'charge.refunded'
    ? (Array.isArray(dataObject.refunds?.data) ? dataObject.refunds.data : [])
    : (dataObject?.id ? [dataObject] : []);

  return rawRefunds
    .filter((refund: any) => refund?.id)
    .map((refund: any) => ({
      refundId: refund.id,
      amount: refund.amount || dataObject.amount_refunded || dataObject.amount || 0,
      currency: ((refund.currency || dataObject.currency || 'jpy') as string).toUpperCase(),
      paymentIntentId: refund.payment_intent || refund.payment_intent_id ||
                       dataObject.payment_intent || dataObject.payment_intent_id || null,
      metadataOrderId: extractOrderId(refund.metadata ?? dataObject.metadata)
    }));
};

const findPaymentForRefund = async (
  env: Env['Bindings'],
  paymentIntentId: string | null,
  metadataOrderId: number | null
): Promise<{ id: number; order_id: number | null } | null> => {
  if (paymentIntentId) {
    const paymentByIntent = await env.DB.prepare(
      `SELECT id, order_id FROM payments WHERE provider_payment_id=?`
    ).bind(paymentIntentId).first<{ id: number; order_id: number | null }>();

    if (paymentByIntent?.id) {
      return paymentByIntent;
    }
  }

  if (metadataOrderId) {
    return await env.DB.prepare(
      `SELECT id, order_id FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1`
    ).bind(metadataOrderId).first<{ id: number; order_id: number | null }>();
  }

  return null;
};

const insertRefundRecord = async (
  env: Env['Bindings'],
  refund: RefundData,
  paymentId: number | null,
  eventId: string
): Promise<{ inserted: boolean; duplicate: boolean }> => {
  try {
    await env.DB.prepare(
      `INSERT INTO refunds (payment_id, status, amount, currency, reason, provider_refund_id, metadata, created_at, updated_at)
       VALUES (?, 'succeeded', ?, ?, 'stripe_refund', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      paymentId,
      refund.amount,
      refund.currency,
      refund.refundId,
      JSON.stringify({ stripe_event: eventId })
    ).run();
    return { inserted: true, duplicate: false };
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
};

const updateOrderAfterRefund = async (
  env: Env['Bindings'],
  orderId: number,
  refundAmount: number,
  eventId: string
) => {
  const orderRow = await env.DB.prepare(
    `SELECT id, total_net, status, refunded_amount FROM orders WHERE id=?`
  ).bind(orderId).first<{
    id: number;
    total_net: number;
    status: string;
    refunded_amount: number;
  }>();

  if (!orderRow?.id) return;

  const isRefundableStatus = orderRow.status === 'paid' || orderRow.status === 'partially_refunded';
  if (!isRefundableStatus) return;

  const oldStatus = orderRow.status;
  const currentRefundedAmount = orderRow.refunded_amount || 0;
  const newRefundedAmount = currentRefundedAmount + refundAmount;

  const refundCountRow = await env.DB.prepare(
    `SELECT refund_count FROM orders WHERE id=?`
  ).bind(orderId).first<{ refund_count: number }>();
  const newRefundCount = (refundCountRow?.refund_count || 0) + 1;

  const newStatus = calculateOrderStatus({
    status: oldStatus,
    total_net: orderRow.total_net || 0,
    refunded_amount: newRefundedAmount
  });

  await env.DB.prepare(
    `UPDATE orders SET status=?, refunded_amount=?, refund_count=?, updated_at=datetime('now') WHERE id=?`
  ).bind(newStatus, newRefundedAmount, newRefundCount, orderRow.id).run();

  if (oldStatus !== newStatus) {
    const reason = getStatusChangeReason(newStatus);
    await env.DB.prepare(
      `INSERT INTO order_status_history (order_id, old_status, new_status, reason, stripe_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(orderId, oldStatus, newStatus, reason, eventId).run();
  }
};

const handleRefundEvents = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: any
): Promise<HandlerResult> => {
  const refunds = extractRefundsFromEvent(event.type, dataObject);
  let sawDuplicate = false;

  for (const refund of refunds) {
    const existingRefund = await env.DB.prepare(
      `SELECT id FROM refunds WHERE provider_refund_id=?`
    ).bind(refund.refundId).first<{ id: number }>();

    if (existingRefund?.id) {
      sawDuplicate = true;
      continue;
    }

    const paymentRow = await findPaymentForRefund(env, refund.paymentIntentId, refund.metadataOrderId);
    const resolvedOrderId = refund.metadataOrderId ?? paymentRow?.order_id ?? null;

    const insertResult = await insertRefundRecord(env, refund, paymentRow?.id ?? null, event.id);
    if (insertResult.duplicate) {
      sawDuplicate = true;
      continue;
    }

    if (resolvedOrderId) {
      await updateOrderAfterRefund(env, resolvedOrderId, refund.amount, event.id);
    }
  }

  return { received: true, duplicate: sawDuplicate };
};

// --- Main Event Dispatcher ---

const REFUND_EVENT_TYPES = ['charge.refunded', 'refund.updated', 'refund.succeeded'];

export const handleStripeEvent = async (env: Env['Bindings'], event: StripeEvent): Promise<HandlerResult> => {
  const eventType = event.type;
  const dataObject = event.data?.object || {};

  if (eventType === 'checkout.session.completed') {
    return handleCheckoutSessionCompleted(env, event, dataObject);
  }

  if (eventType === 'payment_intent.succeeded') {
    return handlePaymentIntentSucceeded(env, event, dataObject);
  }

  if (REFUND_EVENT_TYPES.includes(eventType)) {
    return handleRefundEvents(env, event, dataObject);
  }

  return { received: true };
};

const stripe = new Hono<Env>();

const handleWebhook = async (c: Context<Env>) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonError(c, 'Stripe webhook secret not configured', 500);

  const signature = c.req.header('stripe-signature') ?? null;
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
    // Phase 1: イベントを保存（冪等性チェック）
    const recorded = await recordStripeEvent(c.env, event, payload);
    if (recorded.duplicate) {
      return jsonOk(c, { received: true, duplicate: true });
    }

    // Phase 2: イベントを処理
    try {
      const result = await handleStripeEvent(c.env, event);
      await updateStripeEventStatus(c.env, event.id, 'completed');
      return jsonOk(c, result);
    } catch (processingError: any) {
      // 処理失敗時はエラーを記録
      const errorMessage = processingError?.message || String(processingError);
      await updateStripeEventStatus(c.env, event.id, 'failed', errorMessage);
      throw processingError;
    }
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to process webhook');
  }
};

stripe.post('/webhooks/stripe', handleWebhook);
stripe.post('/stripe/webhook', handleWebhook);

export default stripe;
