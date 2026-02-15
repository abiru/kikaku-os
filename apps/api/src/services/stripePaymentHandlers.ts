import type { Env } from '../env';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import type { HandlerResult } from './stripeEventHandlers';
import {
  type StripeEvent,
  extractOrderId,
  insertPayment,
  extractPaymentMethod
} from '../lib/stripeData';
import { sendOrderConfirmationEmail } from './orderEmail';
import {
  consumeStockReservationForOrder,
  deductStockForOrder,
  releaseStockReservationForOrder
} from './inventoryCheck';
import { createLogger } from '../lib/logger';

const logger = createLogger('stripe-payment');

export const runStatements = async (
  db: Env['Bindings']['DB'],
  statements: D1PreparedStatement[]
): Promise<void> => {
  if (typeof db.batch === 'function') {
    await db.batch(statements);
    return;
  }

  for (const statement of statements) {
    await statement.run();
  }
};

/**
 * Updates order status to 'paid' with Stripe session and payment intent IDs
 * Uses COALESCE to avoid overwriting existing values
 */
const updateOrderToPaid = async (
  env: Env['Bindings'],
  orderId: number,
  sessionId: string,
  paymentIntentId: string | null
): Promise<void> => {
  await env.DB.prepare(
    `UPDATE orders
     SET status='paid',
         provider_checkout_session_id=COALESCE(provider_checkout_session_id, ?),
         provider_payment_intent_id=COALESCE(provider_payment_intent_id, ?),
         paid_at=COALESCE(paid_at, datetime('now')),
         updated_at=datetime('now')
     WHERE id=?`
  )
    .bind(sessionId, paymentIntentId ?? null, orderId)
    .run();
};

/**
 * Ensures a fulfillment record exists for the order
 * Creates a new fulfillment with pending status and Stripe metadata
 */
const ensureFulfillmentExists = async (
  env: Env['Bindings'],
  orderId: number,
  sessionId: string,
  paymentIntentId: string | null,
  eventId: string
): Promise<void> => {
  const existingFulfillment = await env.DB.prepare(
    `SELECT id FROM fulfillments WHERE order_id=?`
  )
    .bind(orderId)
    .first<{ id: number }>();

  if (!existingFulfillment?.id) {
    await env.DB.prepare(
      `INSERT INTO fulfillments (order_id, status, metadata, created_at, updated_at)
       VALUES (?, 'pending', ?, datetime('now'), datetime('now'))`
    )
      .bind(
        orderId,
        JSON.stringify({
          stripe_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId ?? null,
          stripe_event_id: eventId
        })
      )
      .run();
  }
};

/**
 * Extracts coupon info from Stripe metadata and records usage after payment succeeds.
 * Only records when couponId and discountAmount are valid positive numbers.
 */
const recordCouponUsage = async (
  env: Env['Bindings'],
  orderId: number,
  metadata: Record<string, string> | null | undefined
): Promise<void> => {
  const couponId = metadata?.couponId ? Number(metadata.couponId) : null;
  const discountAmount = metadata?.discountAmount
    ? Number(metadata.discountAmount)
    : null;
  if (!couponId || !discountAmount) return;

  const order = await env.DB.prepare(
    `SELECT customer_id FROM orders WHERE id = ?`
  )
    .bind(orderId)
    .first<{ customer_id: number | null }>();

  if (!order) return;

  await env.DB.prepare(
    `INSERT INTO coupon_usages (coupon_id, order_id, customer_id, discount_amount, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(couponId, orderId, order.customer_id, discountAmount)
    .run();

  await env.DB.prepare(
    `UPDATE coupons
     SET current_uses = current_uses + 1,
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(couponId)
    .run();
};

/**
 * Handles checkout.session.completed events
 * Updates order to paid, creates fulfillment, records payment, and sends confirmation email
 */
export const handleCheckoutSessionCompleted = async (
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
  )
    .bind(orderId)
    .first<{ id: number }>();

  if (!existingOrder?.id) {
    return { received: true, ignored: true };
  }

  const sessionId = dataObject.id;
  const paymentIntentId = dataObject.payment_intent;

  await updateOrderToPaid(env, orderId, sessionId, paymentIntentId);
  await ensureFulfillmentExists(env, orderId, sessionId, paymentIntentId, event.id);

  // Save shipping information if provided
  if (dataObject.shipping_details || dataObject.customer_details?.phone) {
    const shippingInfo = {
      address: dataObject.shipping_details?.address || null,
      name: dataObject.shipping_details?.name || null,
      phone: dataObject.customer_details?.phone || null
    };

    await env.DB.prepare(
      `UPDATE orders
       SET metadata = json_set(
             COALESCE(metadata, '{}'),
             '$.shipping',
             json(?)
           ),
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(JSON.stringify(shippingInfo), orderId)
      .run();
  }

  const paymentResult = paymentIntentId
    ? await insertPayment(env, {
        orderId,
        amount: dataObject.amount_total || dataObject.amount_subtotal || 0,
        currency: (dataObject.currency || 'jpy').toUpperCase(),
        method: extractPaymentMethod(dataObject),
        providerPaymentId: paymentIntentId,
        eventId: event.id
      })
    : null;

  // Record coupon usage (only after successful payment)
  await recordCouponUsage(env, orderId, dataObject.metadata);

  // Send order confirmation email (non-blocking)
  if (!paymentResult?.duplicate) {
    sendOrderConfirmationEmail(env, orderId).catch((err) => {
      logger.error('Failed to send order confirmation email', { error: String(err) });
    });
  }

  return { received: true, duplicate: paymentResult?.duplicate };
};

/**
 * Handles payment_intent.succeeded events
 * Updates order to paid, records payment, handles shipping/billing info, and sends confirmation email
 */
export const handlePaymentIntentSucceeded = async (
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
  )
    .bind(orderId)
    .first<{ id: number }>();

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
  )
    .bind(providerPaymentId, orderId)
    .run();

  // Capture shipping/billing address from Payment Element
  let addressInfo = null;

  // Try to get shipping address first (if provided)
  if (dataObject.shipping) {
    addressInfo = {
      name: dataObject.shipping.name,
      address: dataObject.shipping.address,
      phone: dataObject.shipping.phone || dataObject.receipt_email
    };
  }
  // Otherwise, get billing details from latest charge
  else if (dataObject.charges?.data && dataObject.charges.data.length > 0) {
    const charge = dataObject.charges.data[0];
    if (charge.billing_details) {
      addressInfo = {
        name: charge.billing_details.name,
        email: charge.billing_details.email,
        phone: charge.billing_details.phone,
        address: charge.billing_details.address
      };
    }
  }

  if (addressInfo) {
    await env.DB.prepare(
      `UPDATE orders
       SET metadata = json_set(
             COALESCE(metadata, '{}'),
             '$.shipping',
             json(?)
           ),
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(JSON.stringify(addressInfo), orderId)
      .run();
  }

  // Record coupon usage (only after successful payment)
  await recordCouponUsage(env, orderId, dataObject.metadata);

  const paymentResult = await insertPayment(env, {
    orderId,
    amount: dataObject.amount_received || dataObject.amount || 0,
    currency: (dataObject.currency || 'jpy').toUpperCase(),
    method: extractPaymentMethod(dataObject),
    providerPaymentId,
    eventId: event.id
  });

  // Deduct inventory on successful payment (non-duplicate only)
  if (!paymentResult.duplicate) {
    try {
      const consumedReservation = await consumeStockReservationForOrder(env.DB, orderId);
      if (!consumedReservation) {
        // Legacy fallback: Direct stock deduction for orders created before
        // reservation system was introduced (PR #61). This fallback can be
        // removed after all pre-reservation orders have been processed
        // (estimated safe removal date: 2026-06-01).
        // Fallback for legacy orders created before reservation flow
        const orderItems = await env.DB.prepare(
          `SELECT variant_id as variantId, quantity FROM order_items WHERE order_id = ?`
        ).bind(orderId).all<{ variantId: number; quantity: number }>();

        if (orderItems.results && orderItems.results.length > 0) {
          await deductStockForOrder(env.DB, orderId, orderItems.results);
        }
      }
    } catch (err) {
      logger.error('Failed to deduct inventory for order', { orderId, error: String(err) });
    }

    // Send order confirmation email (non-blocking)
    sendOrderConfirmationEmail(env, orderId).catch((err) => {
      logger.error('Failed to send order confirmation email', { error: String(err) });
    });
  }

  return { received: true, duplicate: paymentResult.duplicate };
};

/**
 * Handles payment_intent.payment_failed / payment_intent.canceled events
 * Releases reserved stock and marks pending orders as payment_failed.
 */
export const handlePaymentIntentFailedOrCanceled = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: any
): Promise<HandlerResult> => {
  const orderId = extractOrderId(dataObject.metadata);
  if (!orderId) {
    return { received: true, ignored: true };
  }

  const order = await env.DB.prepare(
    `SELECT id, status FROM orders WHERE id=?`
  )
    .bind(orderId)
    .first<{ id: number; status: string }>();

  if (!order?.id) {
    return { received: true, ignored: true };
  }

  try {
    await releaseStockReservationForOrder(env.DB, orderId);
  } catch (err) {
    logger.error('Failed to release stock reservation for order', { orderId, error: String(err) });
    try {
      await env.DB.prepare(
        `INSERT INTO inbox_items (title, body, severity, status, created_at, updated_at)
         VALUES (?, ?, 'critical', 'open', datetime('now'), datetime('now'))`
      ).bind(
        `Stock reservation cleanup failed for order #${orderId}`,
        `releaseStockReservationForOrder failed during webhook processing. Manual cleanup required. Error: ${err instanceof Error ? err.message : String(err)}`
      ).run();
    } catch {
      // Last resort: already logged above
    }
  }

  const currentStatus = order.status;
  const nextStatus = 'payment_failed';
  if (currentStatus === 'pending') {
    await runStatements(env.DB, [
      env.DB.prepare(
        `UPDATE orders
         SET status=?,
             updated_at=datetime('now')
         WHERE id=? AND status='pending'`
      ).bind(nextStatus, orderId),
      env.DB.prepare(
        `INSERT INTO order_status_history (order_id, old_status, new_status, reason, stripe_event_id, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(orderId, currentStatus, nextStatus, 'payment_failed', event.id)
    ]);
  }

  const failurePayload = {
    orderId,
    paymentIntentId: dataObject.id ?? null,
    eventType: event.type,
    declineCode: dataObject.last_payment_error?.decline_code ?? null,
    code: dataObject.last_payment_error?.code ?? null,
    message:
      dataObject.last_payment_error?.message ??
      dataObject.cancellation_reason ??
      'Payment intent failed',
    stripeEventId: event.id
  };

  await runStatements(env.DB, [
    env.DB.prepare(
      `INSERT INTO events (type, payload, stripe_event_id, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind('payment_failed', JSON.stringify(failurePayload), event.id),
    env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
       VALUES (?, ?, 'high', 'open', 'payment_failed', datetime('now'), datetime('now'))`
    ).bind(`Payment Failed: Order #${orderId}`, JSON.stringify(failurePayload))
  ]);

  return { received: true };
};
