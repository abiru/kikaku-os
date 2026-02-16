import { Hono } from 'hono';
import { z } from 'zod';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { ensureStripeCustomer } from '../../services/stripeCustomer';
import { generatePublicToken } from '../../lib/token';
import {
  checkStockAvailability,
  releaseStockReservationForOrder,
  reserveStockForOrder
} from '../../services/inventoryCheck';

const logger = createLogger('payments');

const paymentIntentSchema = z.object({
  quoteId: z.string().min(1, 'quoteId is required'),
  email: z.string().email('Valid email is required'),
  paymentMethod: z.enum(['card', 'bank_transfer']).optional().default('card'),
});

const runStatements = async (
  db: D1Database,
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
 * Clean up a failed order creation: release stock, delete order items and order.
 * Logs to Inbox on cleanup failure.
 */
const cleanupFailedOrder = async (
  db: D1Database,
  orderId: number
): Promise<void> => {
  try {
    await releaseStockReservationForOrder(db, orderId);
  } catch (releaseErr) {
    logger.error('Failed to release stock reservation during cleanup', { orderId, error: String(releaseErr) });
    try {
      await db.prepare(
        `INSERT INTO inbox_items (title, body, severity, status, created_at, updated_at)
         VALUES (?, ?, 'critical', 'open', datetime('now'), datetime('now'))`
      ).bind(
        `Order cleanup failed: stock reservation release for order #${orderId}`,
        `Manual cleanup required. Error: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`
      ).run();
    } catch {
      // Last resort: already logged
    }
  }

  try {
    await runStatements(db, [
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId),
      db.prepare(`DELETE FROM orders WHERE id = ?`).bind(orderId),
    ]);
  } catch (deleteErr) {
    logger.error('Failed to delete order during cleanup', { orderId, error: String(deleteErr) });
    try {
      await db.prepare(
        `INSERT INTO inbox_items (title, body, severity, status, created_at, updated_at)
         VALUES (?, ?, 'critical', 'open', datetime('now'), datetime('now'))`
      ).bind(
        `Order cleanup failed: could not delete order #${orderId}`,
        `Orphaned order record may exist. Manual cleanup required. Error: ${deleteErr instanceof Error ? deleteErr.message : String(deleteErr)}`
      ).run();
    } catch {
      // Last resort: already logged
    }
  }
};

const payments = new Hono<Env>();

payments.post('/payments/intent', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonError(c, 'Stripe secret key invalid', 500);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const parsed = paymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, parsed.error.issues[0]?.message || 'Invalid request', 400);
  }

  const { quoteId, email, paymentMethod } = parsed.data;

  // Fetch and validate quote
  type QuoteRow = {
    id: string;
    items_json: string;
    coupon_code: string | null;
    coupon_id: number | null;
    subtotal: number;
    tax_amount: number;
    cart_total: number;
    discount: number;
    shipping_fee: number;
    grand_total: number;
    currency: string;
    expires_at: string;
  };

  const quote = await c.env.DB.prepare(
    `SELECT id, items_json, coupon_code, coupon_id,
            subtotal, tax_amount, cart_total,
            discount, shipping_fee, grand_total,
            currency, expires_at
     FROM checkout_quotes
     WHERE id = ?`
  ).bind(quoteId).first<QuoteRow>();

  if (!quote) {
    return jsonError(c, 'Quote not found', 400);
  }

  const quoteItems: Array<{ variantId: number; quantity: number }> = JSON.parse(quote.items_json);

  // Verify stock availability before proceeding
  const stockCheck = await checkStockAvailability(
    c.env.DB,
    quoteItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
  );
  if (!stockCheck.available) {
    return c.json({
      ok: false,
      message: 'Some items are out of stock',
      outOfStock: stockCheck.insufficientItems
    }, 400);
  }

  // Check if quote has expired
  const now = new Date();
  const expiresAt = new Date(quote.expires_at);
  if (expiresAt < now) {
    return jsonError(c, 'Quote has expired', 400);
  }

  // Resolve latest variant pricing for order_items snapshot
  const variantIds = Array.from(new Set(quoteItems.map((item) => item.variantId)));
  const variantPricing = new Map<number, { unitPrice: number; taxRate: number }>();
  if (variantIds.length > 0) {
    const placeholders = variantIds.map(() => '?').join(',');
    const variantPricingRows = await c.env.DB.prepare(
      `SELECT v.id as variantId,
              (
                SELECT pr.amount
                FROM prices pr
                WHERE pr.variant_id = v.id
                ORDER BY pr.id DESC
                LIMIT 1
              ) as unitPrice,
              tr.rate as taxRate
       FROM variants v
       LEFT JOIN products prod ON prod.id = v.product_id
       LEFT JOIN tax_rates tr ON tr.id = prod.tax_rate_id
       WHERE v.id IN (${placeholders})`
    ).bind(...variantIds).all<{
      variantId: number;
      unitPrice: number | null;
      taxRate: number | null;
    }>();

    for (const row of variantPricingRows.results || []) {
      if (typeof row.unitPrice === 'number') {
        variantPricing.set(row.variantId, {
          unitPrice: row.unitPrice,
          taxRate: typeof row.taxRate === 'number' ? row.taxRate : 0.10
        });
      }
    }

    for (const item of quoteItems) {
      if (!variantPricing.has(item.variantId)) {
        return jsonError(c, `Variant ${item.variantId} price not found`, 400);
      }
    }
  }

  // Get or create customer
  let customerId: number | null = null;
  let stripeCustomerId: string | null = null;

  const existingCustomer = await c.env.DB.prepare(
    `SELECT id, stripe_customer_id FROM customers WHERE email=?`
  ).bind(email).first<{ id: number; stripe_customer_id: string | null }>();

  if (existingCustomer?.id) {
    customerId = existingCustomer.id;
    stripeCustomerId = await ensureStripeCustomer(c.env.DB, stripeKey, customerId, email);
  } else {
    const res = await c.env.DB.prepare(
      `INSERT INTO customers (name, email, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`
    ).bind('Storefront Customer', email).run();
    customerId = Number(res.meta.last_row_id);
    stripeCustomerId = await ensureStripeCustomer(c.env.DB, stripeKey, customerId, email);
  }

  // Create order record
  const orderPublicToken = generatePublicToken();
  const orderRes = await c.env.DB.prepare(
    `INSERT INTO orders (
       customer_id, status, quote_id,
       subtotal, tax_amount, total_net,
       total_discount, shipping_fee, total_amount,
       coupon_code, total_fee, currency, metadata,
       public_token, created_at, updated_at
     )
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    customerId,
    quoteId,
    quote.subtotal,
    quote.tax_amount,
    quote.cart_total,
    quote.discount,
    quote.shipping_fee,
    quote.grand_total,
    quote.coupon_code || null,
    quote.currency,
    JSON.stringify({
      source: 'storefront_elements',
      email,
      items: JSON.parse(quote.items_json),
      tax_breakdown: { subtotal: quote.subtotal, tax_amount: quote.tax_amount }
    }),
    orderPublicToken
  ).run();

  const orderId = Number(orderRes.meta.last_row_id);

  // Insert order_items from quote items (batched for atomicity)
  const orderItemStatements = quoteItems.map((item) => {
    const pricing = variantPricing.get(item.variantId)!;
    const unitPrice = pricing.unitPrice;
    const lineTotal = unitPrice * item.quantity;
    const taxRatePercent = Math.round(pricing.taxRate * 100);
    const taxAmount = Math.floor((lineTotal * taxRatePercent) / (100 + taxRatePercent));

    return c.env.DB.prepare(
      `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, tax_rate, tax_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(orderId, item.variantId, item.quantity, unitPrice, taxRatePercent, taxAmount);
  });

  if (orderItemStatements.length > 0) {
    await runStatements(c.env.DB, orderItemStatements);
  }

  // Reserve stock atomically right before payment creation
  const reservation = await reserveStockForOrder(c.env.DB, orderId, quoteItems);
  if (!reservation.reserved) {
    await runStatements(c.env.DB, [
      c.env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId),
      c.env.DB.prepare(`DELETE FROM orders WHERE id = ?`).bind(orderId),
    ]);
    return c.json({
      ok: false,
      message: 'Some items are out of stock',
      outOfStock: reservation.insufficientItems
    }, 400);
  }

  // Create Stripe PaymentIntent
  const params = new URLSearchParams();
  params.set('amount', String(quote.grand_total));
  params.set('currency', quote.currency.toLowerCase());
  params.set('customer', stripeCustomerId!);
  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  params.set('metadata[quoteId]', quoteId);
  params.set('metadata[paymentMethod]', paymentMethod);

  if (paymentMethod === 'bank_transfer') {
    params.append('payment_method_types[]', 'customer_balance');
    params.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
    params.set('payment_method_options[customer_balance][bank_transfer][type]', 'jp_bank_transfer');
  } else {
    params.append('payment_method_types[]', 'card');
  }

  // Store coupon metadata for webhook handler
  if (quote.coupon_id) {
    params.set('metadata[couponId]', String(quote.coupon_id));
    params.set('metadata[discountAmount]', String(quote.discount));
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    logger.error('Stripe PaymentIntent creation failed', { error: text });
    await cleanupFailedOrder(c.env.DB, orderId);
    return jsonError(c, 'Failed to create payment intent', 500);
  }

  const paymentIntent = await stripeRes.json<{ id?: string; client_secret?: string }>();

  if (!paymentIntent?.client_secret || !paymentIntent?.id) {
    await cleanupFailedOrder(c.env.DB, orderId);
    return jsonError(c, 'Invalid payment intent response', 500);
  }

  // Store payment intent ID in order
  await c.env.DB.prepare(
    `UPDATE orders
     SET provider_payment_intent_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(paymentIntent.id, orderId).run();

  // Delete quote after use (cleanup)
  await c.env.DB.prepare(
    `DELETE FROM checkout_quotes WHERE id = ?`
  ).bind(quoteId).run();

  // Get publishable key from environment
  const publishableKey = c.env.STRIPE_PUBLISHABLE_KEY || '';

  return jsonOk(c, {
    clientSecret: paymentIntent.client_secret,
    orderId,
    orderPublicToken,
    publishableKey
  });
});

export default payments;
