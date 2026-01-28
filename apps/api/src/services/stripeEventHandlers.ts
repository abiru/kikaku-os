/**
 * Stripe Event Handlers
 *
 * This module handles core Stripe event processing logic:
 * - Checkout session completion
 * - Payment intent success
 * - Refund events
 * - Bank transfer lifecycle tracking
 * - Customer balance transactions
 */

import type { Env } from '../env';
import {
  type StripeEvent,
  type RefundData,
  extractOrderId,
  insertPayment,
  insertRefundRecord,
  extractRefundsFromEvent,
  findPaymentForRefund,
  extractPaymentMethod
} from '../lib/stripeData';
import {
  calculateOrderStatus,
  getStatusChangeReason
} from './orderStatus';
import { sendOrderConfirmationEmail } from './orderEmail';

/**
 * Handler result type for consistency across all handlers
 */
export type HandlerResult = {
  received: true;
  ignored?: boolean;
  duplicate?: boolean;
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
 * Handles checkout.session.completed events
 * Updates order to paid, creates fulfillment, records payment, and sends confirmation email
 */
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
  const couponId = dataObject.metadata?.couponId
    ? Number(dataObject.metadata.couponId)
    : null;
  const discountAmount = dataObject.metadata?.discountAmount
    ? Number(dataObject.metadata.discountAmount)
    : null;
  if (couponId && discountAmount) {
    const order = await env.DB.prepare(
      `SELECT customer_id FROM orders WHERE id = ?`
    )
      .bind(orderId)
      .first<{ customer_id: number | null }>();

    if (order) {
      // Insert coupon usage record
      await env.DB.prepare(
        `INSERT INTO coupon_usages (coupon_id, order_id, customer_id, discount_amount, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
        .bind(couponId, orderId, order.customer_id, discountAmount)
        .run();

      // Increment coupon usage count
      await env.DB.prepare(
        `UPDATE coupons
         SET current_uses = current_uses + 1,
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(couponId)
        .run();
    }
  }

  // Send order confirmation email (non-blocking)
  if (!paymentResult?.duplicate) {
    sendOrderConfirmationEmail(env, orderId).catch((err) => {
      console.error('Failed to send order confirmation email:', err);
    });
  }

  return { received: true, duplicate: paymentResult?.duplicate };
};

/**
 * Handles payment_intent.succeeded events
 * Updates order to paid, records payment, handles shipping/billing info, and sends confirmation email
 */
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
  const couponId = dataObject.metadata?.couponId
    ? Number(dataObject.metadata.couponId)
    : null;
  const discountAmount = dataObject.metadata?.discountAmount
    ? Number(dataObject.metadata.discountAmount)
    : null;

  if (couponId && discountAmount) {
    const order = await env.DB.prepare(
      `SELECT customer_id FROM orders WHERE id = ?`
    )
      .bind(orderId)
      .first<{ customer_id: number | null }>();

    if (order) {
      // Insert coupon usage record
      await env.DB.prepare(
        `INSERT INTO coupon_usages (coupon_id, order_id, customer_id, discount_amount, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
        .bind(couponId, orderId, order.customer_id, discountAmount)
        .run();

      // Increment coupon usage count
      await env.DB.prepare(
        `UPDATE coupons
         SET current_uses = current_uses + 1,
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(couponId)
        .run();
    }
  }

  const paymentResult = await insertPayment(env, {
    orderId,
    amount: dataObject.amount_received || dataObject.amount || 0,
    currency: (dataObject.currency || 'jpy').toUpperCase(),
    method: extractPaymentMethod(dataObject),
    providerPaymentId,
    eventId: event.id
  });

  return { received: true, duplicate: paymentResult.duplicate };
};

/**
 * Updates order status after refund is processed
 * Recalculates status based on refunded amount and creates status history record
 *
 * CRITICAL: Uses atomic SQL operations to prevent race conditions
 * CRITICAL: Validates refund amount does not exceed order total
 */
const updateOrderAfterRefund = async (
  env: Env['Bindings'],
  orderId: number,
  refundAmount: number,
  eventId: string
): Promise<void> => {
  const orderRow = await env.DB.prepare(
    `SELECT id, total_net, status, refunded_amount FROM orders WHERE id=?`
  )
    .bind(orderId)
    .first<{
      id: number;
      total_net: number;
      status: string;
      refunded_amount: number;
    }>();

  if (!orderRow?.id) return;

  const isRefundableStatus =
    orderRow.status === 'paid' || orderRow.status === 'partially_refunded';
  if (!isRefundableStatus) return;

  const oldStatus = orderRow.status;
  const currentRefundedAmount = orderRow.refunded_amount || 0;
  const projectedRefundedAmount = currentRefundedAmount + refundAmount;

  // Validation: Prevent over-refunding (CRITICAL)
  if (projectedRefundedAmount > orderRow.total_net) {
    const errorMsg = `Refund would exceed order total: ${projectedRefundedAmount} > ${orderRow.total_net}`;
    console.error(`[Order ${orderId}] ${errorMsg}`);

    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
       VALUES (?, ?, 'critical', 'open', 'refund_anomaly', datetime('now'), datetime('now'))`
    )
      .bind(
        `Refund Exceeds Order Total: Order #${orderId}`,
        JSON.stringify({
          orderId,
          totalNet: orderRow.total_net,
          currentRefunded: currentRefundedAmount,
          attemptedRefund: refundAmount,
          projectedTotal: projectedRefundedAmount,
          stripeEventId: eventId,
          error: errorMsg
        })
      )
      .run();

    throw new Error(errorMsg);
  }

  // Calculate projected status based on new refund amount
  const projectedStatus = calculateOrderStatus({
    status: oldStatus,
    total_net: orderRow.total_net || 0,
    refunded_amount: projectedRefundedAmount
  });

  // Atomic update with validation (prevents race conditions)
  const updateResult = await env.DB.prepare(
    `UPDATE orders
     SET status = ?,
         refunded_amount = refunded_amount + ?,
         refund_count = refund_count + 1,
         updated_at = datetime('now')
     WHERE id = ?
       AND status IN ('paid', 'partially_refunded')
       AND (refunded_amount + ?) <= total_net`
  )
    .bind(projectedStatus, refundAmount, orderId, refundAmount)
    .run();

  // Check if update succeeded (meta.changes > 0)
  if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
    // Concurrent refund exceeded limit - create inbox alert
    const concurrentErrorMsg = `Concurrent refund rejected: Order #${orderId} validation failed`;
    console.error(`[Order ${orderId}] ${concurrentErrorMsg}`);

    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
       VALUES (?, ?, 'critical', 'open', 'refund_anomaly', datetime('now'), datetime('now'))`
    )
      .bind(
        `Concurrent Refund Rejected: Order #${orderId}`,
        JSON.stringify({
          orderId,
          totalNet: orderRow.total_net,
          currentRefunded: currentRefundedAmount,
          attemptedRefund: refundAmount,
          stripeEventId: eventId,
          error: concurrentErrorMsg
        })
      )
      .run();

    throw new Error(concurrentErrorMsg);
  }

  // Record status change in history (only if status changed)
  if (oldStatus !== projectedStatus) {
    const reason = getStatusChangeReason(projectedStatus);
    await env.DB.prepare(
      `INSERT INTO order_status_history (order_id, old_status, new_status, reason, stripe_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(orderId, oldStatus, projectedStatus, reason, eventId)
      .run();
  }
};

/**
 * Handles all refund-related events (charge.refunded, refund.updated, refund.succeeded)
 * Creates refund records and updates order refund status
 */
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
    )
      .bind(refund.refundId)
      .first<{ id: number }>();

    if (existingRefund?.id) {
      sawDuplicate = true;
      continue;
    }

    const paymentRow = await findPaymentForRefund(
      env,
      refund.paymentIntentId,
      refund.metadataOrderId
    );
    const resolvedOrderId =
      refund.metadataOrderId ?? paymentRow?.order_id ?? null;

    const insertResult = await insertRefundRecord(
      env,
      refund,
      paymentRow?.id ?? null,
      event.id
    );
    if (insertResult.duplicate) {
      sawDuplicate = true;
      continue;
    }

    if (resolvedOrderId) {
      await updateOrderAfterRefund(
        env,
        resolvedOrderId,
        refund.amount,
        event.id
      );
    }
  }

  return { received: true, duplicate: sawDuplicate };
};

/**
 * Event types that trigger refund handling
 */
const REFUND_EVENT_TYPES = ['charge.refunded', 'refund.updated', 'refund.succeeded'];

/**
 * Main Stripe event dispatcher
 * Routes events to appropriate handlers based on event type
 *
 * Supported events:
 * - checkout.session.completed: Embedded checkout completion
 * - payment_intent.succeeded: Payment Element success
 * - charge.refunded, refund.*, etc.: Refund processing
 * - payment_intent.processing: Bank transfer initiated
 * - payment_intent.requires_action: Bank transfer awaiting customer action
 * - customer_balance.transaction.*: Bank transfer transaction lifecycle
 */
export const handleStripeEvent = async (
  env: Env['Bindings'],
  event: StripeEvent
): Promise<HandlerResult> => {
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

  // Bank transfer specific events (audit trail and monitoring)
  if (eventType === 'payment_intent.processing') {
    // Bank transfer initiated but not yet completed
    const orderId = extractOrderId(dataObject.metadata);
    if (orderId) {
      await env.DB.prepare(
        `INSERT INTO events (type, payload, stripe_event_id, created_at)
         VALUES ('bank_transfer_processing', ?, ?, datetime('now'))`
      )
        .bind(
          JSON.stringify({
            order_id: orderId,
            payment_intent: dataObject.id
          }),
          event.id
        )
        .run();
    }
    return { received: true };
  }

  if (eventType === 'payment_intent.requires_action') {
    // Customer needs to complete bank transfer
    // dataObject.next_action contains bank transfer instructions
    const orderId = extractOrderId(dataObject.metadata);
    if (orderId) {
      await env.DB.prepare(
        `INSERT INTO events (type, payload, stripe_event_id, created_at)
         VALUES ('bank_transfer_requires_action', ?, ?, datetime('now'))`
      )
        .bind(
          JSON.stringify({
            order_id: orderId,
            payment_intent: dataObject.id,
            next_action: dataObject.next_action
          }),
          event.id
        )
        .run();

      // Future: Send customer email with bank transfer instructions
      // Bank transfer details are in dataObject.next_action.display_bank_transfer_instructions
    }
    return { received: true };
  }

  if (
    eventType === 'customer_balance.transaction.created' ||
    eventType === 'customer_balance.transaction.updated'
  ) {
    // Bank transfer transaction lifecycle tracking
    // These events fire when Stripe receives the actual bank deposit
    await env.DB.prepare(
      `INSERT INTO events (type, payload, stripe_event_id, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(eventType, JSON.stringify(dataObject), event.id)
      .run();
    return { received: true };
  }

  return { received: true };
};
