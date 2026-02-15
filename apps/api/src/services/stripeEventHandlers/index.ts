/**
 * Stripe Event Handlers - Main dispatcher
 *
 * Routes Stripe webhook events to specialized handler modules:
 * - Checkout session completion
 * - Payment intent success
 * - Refund events
 * - Payment failure / cancellation
 * - Charge disputes
 * - Bank transfer lifecycle tracking
 * - Customer balance transactions
 */

import type { Env } from '../../env';
import type { StripeEvent } from '../../lib/stripeData';
import { extractOrderId } from '../../lib/stripeData';
import { sendBankTransferInstructionsEmail } from '../orderEmail';

import type { HandlerResult } from './shared';
import { handleCheckoutSessionCompleted } from './checkoutHandler';
import { handlePaymentIntentSucceeded } from './paymentHandler';
import { handleRefundEvents } from './refundHandler';
import { handlePaymentIntentFailedOrCanceled } from './failureHandler';
import { handleChargeDispute } from './disputeHandler';

export type { HandlerResult };

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

      // Send bank transfer instructions email to customer
      if (dataObject.next_action?.display_bank_transfer_instructions) {
        try {
          // Get customer email from order
          const order = await env.DB.prepare(
            `SELECT o.id, c.email FROM orders o
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE o.id = ?`
          ).bind(orderId).first<{ id: number; email: string | null }>();

          if (order?.email) {
            await sendBankTransferInstructionsEmail(env, {
              customerEmail: order.email,
              orderId,
              amount: dataObject.amount || 0,
              currency: (dataObject.currency || 'JPY').toUpperCase(),
              bankTransferInstructions: dataObject.next_action.display_bank_transfer_instructions,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send bank transfer instructions email:', emailErr);
          // Non-critical: email failure should not block webhook processing
        }
      }
    }
    return { received: true };
  }

  if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
    return handlePaymentIntentFailedOrCanceled(env, event, dataObject);
  }

  // Chargeback / dispute events
  if (
    eventType === 'charge.dispute.created' ||
    eventType === 'charge.dispute.updated'
  ) {
    return handleChargeDispute(env, event, dataObject);
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
