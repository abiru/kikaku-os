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

/** Classify Stripe HTTP errors as transient (retriable) or permanent */
function isTransientStripeError(status: number): boolean {
  // 429 = rate limited, 500/502/503/504 = server errors
  return status === 429 || status >= 500;
}

const paymentIntentSchema = z.object({
  quoteId: z.string().min(1, 'quoteId is required'),
  email: z.string().email('Valid email is required').optional(),
  paymentMethod: z.enum(['card', 'bank_transfer', 'auto']).optional().default('auto'),
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

const extractAccountIdFromRequestLogUrl = (requestLogUrl: string | undefined): string | null => {
  if (!requestLogUrl) return null;
  const match = requestLogUrl.match(/dashboard\.stripe\.com\/(acct_[^/]+)/);
  return match?.[1] || null;
};

const getSecretKeyAccountId = async (secretKey: string): Promise<string | null> => {
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        authorization: `Bearer ${secretKey}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json<{ id?: string }>();
    return data.id || null;
  } catch {
    return null;
  }
};

const getPublishableKeyAccountHint = async (publishableKey: string): Promise<string | null> => {
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        authorization: `Bearer ${publishableKey}`,
      },
    });
    const data = await res.json<{
      error?: {
        request_log_url?: string;
      };
    }>();
    return extractAccountIdFromRequestLogUrl(data.error?.request_log_url);
  } catch {
    return null;
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

/**
 * Look up a cached idempotent response from D1.
 * Returns null when no cache hit, or the parsed response object on hit.
 */
const lookupIdempotencyCache = async (
  db: D1Database,
  key: string,
  endpoint: string
): Promise<{ statusCode: number; body: string } | null> => {
  const row = await db.prepare(
    `SELECT status_code, response_body FROM idempotency_keys
     WHERE idempotency_key = ? AND endpoint = ? AND expires_at > datetime('now')`
  ).bind(key, endpoint).first<{ status_code: number; response_body: string }>();

  if (!row) return null;
  return { statusCode: row.status_code, body: row.response_body };
};

/**
 * Store a response in the idempotency cache.
 */
const storeIdempotencyCache = async (
  db: D1Database,
  key: string,
  endpoint: string,
  statusCode: number,
  responseBody: string
): Promise<void> => {
  await db.prepare(
    `INSERT OR IGNORE INTO idempotency_keys (idempotency_key, endpoint, status_code, response_body, created_at, expires_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+24 hours'))`
  ).bind(key, endpoint, statusCode, responseBody).run();
};

const payments = new Hono<Env>();

payments.post('/payments/intent', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonError(c, 'Stripe secret key invalid', 500);
  }
  const publishableKey = c.env.STRIPE_PUBLISHABLE_KEY || '';

  // Extract idempotency key from header
  const idempotencyKey = c.req.header('Idempotency-Key') || null;
  const endpointPath = '/payments/intent';

  // Check idempotency cache for duplicate request
  if (idempotencyKey) {
    try {
      const cached = await lookupIdempotencyCache(c.env.DB, idempotencyKey, endpointPath);
      if (cached) {
        return c.json(JSON.parse(cached.body), cached.statusCode as 200);
      }
    } catch (cacheErr) {
      logger.error('Idempotency cache lookup failed', { error: String(cacheErr) });
      // Continue processing on cache lookup failure
    }
  }

  if (c.env.DEV_MODE === 'true' && publishableKey) {
    const [secretAccountId, publishableAccountHint] = await Promise.all([
      getSecretKeyAccountId(stripeKey),
      getPublishableKeyAccountHint(publishableKey),
    ]);

    if (
      secretAccountId &&
      publishableAccountHint &&
      secretAccountId !== publishableAccountHint
    ) {
      return jsonError(
        c,
        `Stripe key mismatch: STRIPE_SECRET_KEY is for ${secretAccountId} but STRIPE_PUBLISHABLE_KEY is for ${publishableAccountHint}`,
        500
      );
    }
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

  // Validate currency: only JPY is allowed
  if (quote.currency.toUpperCase() !== 'JPY') {
    return jsonError(c, 'Only JPY currency is supported', 400);
  }

  // Validate amount: must be a positive integer
  if (quote.grand_total <= 0) {
    return jsonError(c, 'Payment amount must be greater than zero', 400);
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

  // Get or create customer only when email is explicitly provided.
  let customerId: number | null = null;
  let stripeCustomerId: string | null = null;

  if (email) {
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
      email: email || null,
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
  if (stripeCustomerId) {
    params.set('customer', stripeCustomerId);
  }
  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  params.set('metadata[quoteId]', quoteId);
  params.set('metadata[paymentMethod]', paymentMethod);

  if (paymentMethod === 'bank_transfer') {
    params.append('payment_method_types[]', 'customer_balance');
    params.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
    params.set('payment_method_options[customer_balance][bank_transfer][type]', 'jp_bank_transfer');
  } else if (paymentMethod === 'card') {
    params.append('payment_method_types[]', 'card');
  } else {
    if (stripeCustomerId) {
      params.append('payment_method_types[]', 'card');
      params.append('payment_method_types[]', 'customer_balance');
      params.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
      params.set('payment_method_options[customer_balance][bank_transfer][type]', 'jp_bank_transfer');
    } else {
      params.set('automatic_payment_methods[enabled]', 'true');
      params.set('automatic_payment_methods[allow_redirects]', 'never');
    }
  }

  // Store coupon metadata for webhook handler
  if (quote.coupon_id) {
    params.set('metadata[couponId]', String(quote.coupon_id));
    params.set('metadata[discountAmount]', String(quote.discount));
  }

  const stripeHeaders: Record<string, string> = {
    authorization: `Bearer ${stripeKey}`,
    'content-type': 'application/x-www-form-urlencoded'
  };
  if (idempotencyKey) {
    stripeHeaders['Idempotency-Key'] = idempotencyKey;
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: stripeHeaders,
    body: params.toString()
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    const status = stripeRes.status;
    logger.error('Stripe PaymentIntent creation failed', { error: text, status });
    await cleanupFailedOrder(c.env.DB, orderId);

    if (isTransientStripeError(status)) {
      return c.json(
        { ok: false, message: 'Payment service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
        { status: 503, headers: { 'Retry-After': '10' } }
      );
    }

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

  // Build the success response
  const responseBody = {
    ok: true,
    clientSecret: paymentIntent.client_secret,
    orderId,
    orderPublicToken,
    publishableKey
  };

  // Cache the response for idempotent replay
  if (idempotencyKey) {
    try {
      await storeIdempotencyCache(
        c.env.DB,
        idempotencyKey,
        endpointPath,
        200,
        JSON.stringify(responseBody)
      );
    } catch (cacheErr) {
      logger.error('Idempotency cache store failed', { error: String(cacheErr) });
      // Non-fatal: continue returning the response
    }
  }

  return c.json(responseBody);
});

export default payments;
