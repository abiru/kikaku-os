import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { calculateOrderTax, type TaxCalculationInput } from '../../services/tax';
import { getShippingSettings } from '../../services/settings';
import { checkStockAvailability } from '../../services/inventoryCheck';
import { validateItem, type CheckoutItem, type VariantPriceRow } from '../../lib/schemas/checkout';
import { validateCoupon } from '../../services/coupon';
import { ensureStripeCustomer } from '../../services/stripeCustomer';

const logger = createLogger('checkout');

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(50),
  cartTotal: z.number().int().min(0),
});

const checkout = new Hono<Env>();

// Generate UUID for quote ID
const generateQuoteId = () => {
  return crypto.randomUUID();
};

checkout.get('/checkout/config', async (c) => {
  const shippingSettings = await getShippingSettings(c.env);
  return jsonOk(c, {
    shippingFee: shippingSettings.shippingFee,
    freeShippingThreshold: shippingSettings.freeShippingThreshold
  });
});

checkout.post('/checkout/validate-coupon', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = validateCouponSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(c, parsed.error.issues[0]?.message || 'Invalid request', 400);
    }

    const { code, cartTotal } = parsed.data;
    const result = await validateCoupon(c.env.DB, code, cartTotal);
    return jsonOk(c, { ...result });
  } catch (err) {
    logger.error('Coupon validation error', { error: String(err) });
    return jsonError(c, 'Failed to validate coupon', 500);
  }
});

type CheckoutVariantPriceRow = VariantPriceRow & {
  image_r2_key: string | null;
  tax_rate: number | null;
};

checkout.post('/checkout/quote', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }
  const bodyObj = body as Record<string, unknown> | null;

  // Validate items
  let items: CheckoutItem[] = [];
  if (Array.isArray(bodyObj?.items)) {
    for (const rawItem of (bodyObj.items as unknown[])) {
      const item = validateItem(rawItem);
      if (!item) {
        return jsonError(c, 'Invalid item in items array', 400);
      }
      items.push(item);
    }
  }

  if (items.length === 0) {
    return jsonError(c, 'No items provided', 400);
  }
  if (items.length > 20) {
    return jsonError(c, 'Too many items (max 20)', 400);
  }

  // Fetch all variant/price data in one query
  const variantIds = items.map((i) => i.variantId);
  const placeholders = variantIds.map(() => '?').join(',');
  const variantRows = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            p.provider_product_id as provider_product_id,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency,
            pr.provider_price_id as provider_price_id,
            pi.r2_key as image_r2_key,
            tr.rate as tax_rate
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
       AND pi.position = (SELECT MIN(position) FROM product_images WHERE product_id = p.id)
     WHERE v.id IN (${placeholders}) AND p.status = 'active'
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<CheckoutVariantPriceRow>();

  // Build map of variant_id -> price row
  const variantMap = new Map<number, CheckoutVariantPriceRow>();
  for (const row of variantRows.results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }

  // Validate all variants exist
  for (const item of items) {
    const row = variantMap.get(item.variantId);
    if (!row) {
      return jsonError(c, `Variant ${item.variantId} not found`, 404);
    }
  }

  // Check stock availability
  const stockCheck = await checkStockAvailability(
    c.env.DB,
    items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
  );

  if (!stockCheck.available) {
    const outOfStock = stockCheck.insufficientItems.map((item) => {
      const row = variantMap.get(item.variantId);
      return {
        variantId: item.variantId,
        title: row?.variant_title ?? 'Unknown',
        requested: item.requested,
        available: item.available
      };
    });
    return c.json({
      ok: false,
      message: 'Some items are out of stock',
      outOfStock
    }, 400);
  }

  // Calculate tax for all items
  const taxInputs: TaxCalculationInput[] = items.map((item) => {
    const row = variantMap.get(item.variantId)!;
    return {
      unitPrice: row.amount,
      quantity: item.quantity,
      taxRate: row.tax_rate || 0.10
    };
  });

  const taxCalculation = calculateOrderTax(taxInputs);
  const subtotal = taxCalculation.subtotal;
  const taxAmount = taxCalculation.taxAmount;
  const cartTotal = taxCalculation.totalAmount;

  let currency = 'JPY';
  const firstItem = items[0];
  if (firstItem) {
    const row = variantMap.get(firstItem.variantId);
    currency = (row?.currency || 'JPY').toUpperCase();
  }

  // Coupon validation and discount calculation
  const couponCode = typeof bodyObj?.couponCode === 'string' ? bodyObj.couponCode.trim() : '';
  let discountAmount = 0;
  let couponId: number | null = null;

  if (couponCode) {
    const couponResult = await validateCoupon(c.env.DB, couponCode, cartTotal);
    if (!couponResult.valid) {
      return jsonError(c, couponResult.message, 400);
    }
    discountAmount = couponResult.coupon.discountAmount;
    couponId = couponResult.coupon.id;
  }

  // Shipping fee calculation
  const shippingSettings = await getShippingSettings(c.env);
  const shippingFee = shippingSettings.shippingFee;
  const freeThreshold = shippingSettings.freeShippingThreshold;
  const actualShippingFee = cartTotal >= freeThreshold ? 0 : shippingFee;

  // Calculate grand total
  const grandTotal = cartTotal - discountAmount + actualShippingFee;

  // Generate quote ID and store quote
  const quoteId = generateQuoteId();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  await c.env.DB.prepare(
    `INSERT INTO checkout_quotes (
       id, items_json, coupon_code, coupon_id,
       subtotal, tax_amount, cart_total,
       discount, shipping_fee, grand_total,
       currency, expires_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    quoteId,
    JSON.stringify(items),
    couponCode || null,
    couponId,
    subtotal,
    taxAmount,
    cartTotal,
    discountAmount,
    actualShippingFee,
    grandTotal,
    currency,
    expiresAt
  ).run();

  return jsonOk(c, {
    quoteId,
    breakdown: {
      subtotal,
      taxAmount,
      cartTotal,
      discount: discountAmount,
      shippingFee: actualShippingFee,
      grandTotal,
      currency
    },
    expiresAt
  });
});

const guestEmailSchema = z.object({
  orderId: z.number().int().positive(),
  email: z.string().email('Valid email is required'),
});

checkout.post('/checkout/guest-email', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const parsed = guestEmailSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, parsed.error.issues[0]?.message || 'Invalid request', 400);
  }

  const { orderId, email } = parsed.data;

  try {
    // Verify the order exists and is still pending
    const order = await c.env.DB.prepare(
      `SELECT id, customer_id, status FROM orders WHERE id = ?`
    ).bind(orderId).first<{ id: number; customer_id: number | null; status: string }>();

    if (!order) {
      return jsonError(c, 'Order not found', 404);
    }

    if (order.status !== 'pending') {
      return jsonError(c, 'Order is no longer pending', 400);
    }

    // Find or create customer by email
    const existingCustomer = await c.env.DB.prepare(
      `SELECT id, stripe_customer_id FROM customers WHERE email = ?`
    ).bind(email).first<{ id: number; stripe_customer_id: string | null }>();

    let customerId: number;

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const res = await c.env.DB.prepare(
        `INSERT INTO customers (name, email, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      ).bind('Guest Customer', email).run();
      customerId = Number(res.meta.last_row_id);
    }

    // Create Stripe customer if configured
    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      await ensureStripeCustomer(c.env.DB, stripeKey, customerId, email);
    }

    // Update the order with the customer
    await c.env.DB.prepare(
      `UPDATE orders SET customer_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(customerId, orderId).run();

    return jsonOk(c, { customerId });
  } catch (err) {
    logger.error('Guest email association failed', { orderId, error: String(err) });
    return jsonError(c, 'Failed to associate email', 500);
  }
});

export default checkout;
