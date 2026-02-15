/**
 * Handler for payment_intent.succeeded events
 *
 * Updates order to paid, records payment, handles shipping/billing info,
 * and sends confirmation email.
 */

import type { Env } from '../../env';
import type { HandlerResult } from './shared';
import { recordCouponUsage } from './shared';
import {
  type StripeEvent,
  extractOrderId,
  insertPayment,
  extractPaymentMethod
} from '../../lib/stripeData';
import { sendOrderConfirmationEmail } from '../orderEmail';
import {
  consumeStockReservationForOrder,
  deductStockForOrder
} from '../inventoryCheck';

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
      console.error('Failed to deduct inventory for order:', orderId, err);
    }

    // Send order confirmation email (non-blocking)
    sendOrderConfirmationEmail(env, orderId).catch((err) => {
      console.error('Failed to send order confirmation email:', err);
    });
  }

  return { received: true, duplicate: paymentResult.duplicate };
};
