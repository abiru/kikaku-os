/**
 * Order cancellation service
 * Handles order status validation, Stripe PaymentIntent cancellation,
 * inventory restoration, and audit logging.
 */

import { logAuditEvent } from '../lib/audit';
import { CANCELLABLE_STATUSES } from '../lib/schemas/order';

type OrderRow = {
  id: number;
  status: string;
  provider_payment_intent_id: string | null;
  customer_id: number | null;
};

type OrderItemRow = {
  variant_id: number;
  quantity: number;
};

type CancelOrderParams = {
  db: D1Database;
  orderId: number;
  reason: string;
  actor: string;
  stripeSecretKey?: string;
};

type CancelOrderResult =
  | { ok: true; order: { id: number; status: string }; stripeRefunded: boolean; inventoryRestored: number }
  | { ok: false; error: string; status: 400 | 404 | 409 | 500 };

/**
 * Cancel an order with full business logic:
 * 1. Validate order exists and is cancellable
 * 2. Cancel Stripe PaymentIntent if applicable
 * 3. Restore inventory quantities
 * 4. Update order status to 'cancelled'
 * 5. Record status history and audit log
 */
export async function cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
  const { db, orderId, reason, actor, stripeSecretKey } = params;

  // 1. Get order and validate
  const order = await db
    .prepare('SELECT id, status, provider_payment_intent_id, customer_id FROM orders WHERE id = ?')
    .bind(orderId)
    .first<OrderRow>();

  if (!order) {
    return { ok: false, error: 'Order not found', status: 404 };
  }

  if (!CANCELLABLE_STATUSES.includes(order.status as typeof CANCELLABLE_STATUSES[number])) {
    return {
      ok: false,
      error: `Order cannot be cancelled (current status: ${order.status})`,
      status: 400,
    };
  }

  // 2. Cancel Stripe PaymentIntent if exists and order was paid
  let stripeRefunded = false;
  if (order.status === 'paid' && order.provider_payment_intent_id && stripeSecretKey) {
    const stripeCancelResult = await cancelStripePaymentIntent(
      order.provider_payment_intent_id,
      stripeSecretKey,
      orderId,
      reason,
      actor
    );

    if (!stripeCancelResult.ok) {
      return {
        ok: false,
        error: stripeCancelResult.error,
        status: 500,
      };
    }
    stripeRefunded = stripeCancelResult.refunded;
  }

  // 3. Restore inventory quantities
  const orderItems = await db
    .prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?')
    .bind(orderId)
    .all<OrderItemRow>();

  let inventoryRestored = 0;
  const items = orderItems.results || [];
  for (const item of items) {
    if (item.variant_id) {
      await db
        .prepare(
          `INSERT INTO inventory_movements (variant_id, delta, reason, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(
          item.variant_id,
          item.quantity,
          'order_cancelled',
          JSON.stringify({ order_id: orderId, reason })
        )
        .run();
      inventoryRestored += item.quantity;
    }
  }

  // 4. Update order status
  const updateResult = await db
    .prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = ?`
    )
    .bind(orderId, order.status)
    .run();

  if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
    return {
      ok: false,
      error: 'Order was modified concurrently, please retry',
      status: 409,
    };
  }

  // 5. Record status history
  await db
    .prepare(
      `INSERT INTO order_status_history (order_id, old_status, new_status, reason, created_at)
       VALUES (?, ?, 'cancelled', ?, datetime('now'))`
    )
    .bind(orderId, order.status, reason)
    .run();

  // 6. Audit log
  await logAuditEvent(db, {
    actor,
    action: 'cancel_order',
    target: 'order',
    targetId: orderId,
    metadata: {
      reason,
      previous_status: order.status,
      stripe_refunded: stripeRefunded,
      inventory_restored: inventoryRestored,
    },
  });

  return {
    ok: true,
    order: { id: orderId, status: 'cancelled' },
    stripeRefunded,
    inventoryRestored,
  };
}

/**
 * Cancel or refund a Stripe PaymentIntent.
 * If the PI is still cancellable (not yet captured), cancel it.
 * If already captured, create a full refund.
 */
async function cancelStripePaymentIntent(
  paymentIntentId: string,
  stripeSecretKey: string,
  orderId: number,
  reason: string,
  actor: string
): Promise<{ ok: true; refunded: boolean } | { ok: false; error: string }> {
  // First try to cancel the PaymentIntent
  const cancelRes = await fetch(
    `https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stripeSecretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'cancellation_reason': 'requested_by_customer',
        'metadata[order_id]': String(orderId),
        'metadata[cancel_reason]': reason,
        'metadata[actor]': actor,
      }).toString(),
    }
  );

  if (cancelRes.ok) {
    return { ok: true, refunded: false };
  }

  // If cancel fails (already captured), try a full refund
  const cancelError = await cancelRes.json() as { error?: { code?: string } };
  if (cancelError.error?.code === 'payment_intent_unexpected_state') {
    const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stripeSecretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        'metadata[order_id]': String(orderId),
        'metadata[cancel_reason]': reason,
        'metadata[actor]': actor,
      }).toString(),
    });

    if (refundRes.ok) {
      return { ok: true, refunded: true };
    }

    const refundError = await refundRes.text();
    console.error('Stripe refund failed:', refundError);
    return { ok: false, error: 'Failed to refund payment via Stripe' };
  }

  const errorText = JSON.stringify(cancelError);
  console.error('Stripe cancel failed:', errorText);
  return { ok: false, error: 'Failed to cancel payment via Stripe' };
}
