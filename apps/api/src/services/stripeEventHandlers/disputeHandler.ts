/**
 * Handler for charge.dispute.created and charge.dispute.updated events
 *
 * Creates critical Inbox items for admin attention and records event payloads.
 */

import type { Env } from '../../env';
import type { HandlerResult } from './shared';
import type { StripeEvent } from '../../lib/stripeData';

export const handleChargeDispute = async (
  env: Env['Bindings'],
  event: StripeEvent,
  dataObject: Record<string, any>
): Promise<HandlerResult> => {
  const disputeId = dataObject.id;
  const chargeId = dataObject.charge;
  const amount = dataObject.amount;
  const currency = dataObject.currency || 'jpy';
  const reason = dataObject.reason || 'unknown';
  const status = dataObject.status || 'needs_response';
  const isCreated = event.type === 'charge.dispute.created';

  // Try to find the order via payment_intent -> orders
  const paymentIntentId = dataObject.payment_intent;
  let orderId: number | null = null;

  if (paymentIntentId) {
    const payment = await env.DB.prepare(
      `SELECT order_id FROM payments WHERE provider_payment_id = ? LIMIT 1`
    ).bind(paymentIntentId).first<{ order_id: number }>();
    orderId = payment?.order_id ?? null;
  }

  // Record the event
  await env.DB.prepare(
    `INSERT INTO events (type, payload, stripe_event_id, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).bind(
    event.type,
    JSON.stringify({
      dispute_id: disputeId,
      charge_id: chargeId,
      order_id: orderId,
      amount,
      currency,
      reason,
      status
    }),
    event.id
  ).run();

  // Do not mutate order.status here. Current order status constraints do not include
  // a dedicated disputed state, so we keep the webhook path side-effect free and
  // rely on inbox alerts/events for operator action.

  // Create critical Inbox item
  const title = isCreated
    ? `Chargeback Received: ${orderId ? `Order #${orderId}` : `Charge ${chargeId}`}`
    : `Chargeback Updated: ${orderId ? `Order #${orderId}` : `Charge ${chargeId}`} - ${status}`;

  await env.DB.prepare(
    `INSERT INTO inbox_items (title, body, severity, status, kind, created_at, updated_at)
     VALUES (?, ?, 'critical', 'open', 'chargeback', datetime('now'), datetime('now'))`
  ).bind(
    title,
    JSON.stringify({
      disputeId,
      chargeId,
      orderId,
      amount,
      currency,
      reason,
      disputeStatus: status,
      eventType: event.type,
      stripeEventId: event.id
    })
  ).run();

  return { received: true };
};
