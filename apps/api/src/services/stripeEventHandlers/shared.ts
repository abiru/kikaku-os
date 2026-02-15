/**
 * Shared types and utilities for Stripe event handlers
 */

import type { Env } from '../../env';
import type { D1PreparedStatement } from '@cloudflare/workers-types';

/**
 * Handler result type for consistency across all handlers
 */
export type HandlerResult = {
  received: true;
  ignored?: boolean;
  duplicate?: boolean;
};

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
 * Extracts coupon info from Stripe metadata and records usage after payment succeeds.
 * Only records when couponId and discountAmount are valid positive numbers.
 */
export const recordCouponUsage = async (
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
