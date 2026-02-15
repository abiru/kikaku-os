/**
 * Handler for refund-related events (charge.refunded, refund.updated, refund.succeeded)
 *
 * Creates refund records and updates order refund status with atomic operations.
 */

import type { Env } from '../../env';
import type { HandlerResult } from './shared';
import {
  type StripeEvent,
  extractRefundsFromEvent,
  insertRefundRecord,
  findPaymentForRefund
} from '../../lib/stripeData';
import {
  calculateOrderStatus,
  getStatusChangeReason
} from '../orderStatus';
import { createLogger } from '../../lib/logger';

const logger = createLogger('stripe-refund-handler');

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
    logger.error('Refund would exceed order total', { orderId, projected: projectedRefundedAmount, totalNet: orderRow.total_net });

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
    logger.error('Concurrent refund rejected', { orderId, error: concurrentErrorMsg });

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
export const handleRefundEvents = async (
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
