/**
 * Handler for payment_intent.payment_failed and payment_intent.canceled events
 *
 * Releases reserved stock and marks pending orders as payment_failed.
 */

import type { Env } from '../../env';
import type { HandlerResult } from './shared';
import { runStatements } from './shared';
import { type StripeEvent, type StripeDataObject, extractOrderId } from '../../lib/stripeData';
import { releaseStockReservationForOrder } from '../inventoryCheck';
import { createLogger } from '../../lib/logger';

const logger = createLogger('stripe-failure-handler');

export const handlePaymentIntentFailedOrCanceled = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: StripeDataObject
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

  const lastPaymentError = dataObject.last_payment_error as Record<string, unknown> | undefined;
  const failurePayload = {
    orderId,
    paymentIntentId: dataObject.id ?? null,
    eventType: event.type,
    declineCode: lastPaymentError?.decline_code ?? null,
    code: lastPaymentError?.code ?? null,
    message:
      (lastPaymentError?.message as string) ??
      (dataObject.cancellation_reason as string) ??
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
