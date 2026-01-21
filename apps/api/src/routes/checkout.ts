import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { ensureStripePriceForVariant } from '../services/stripe';

const checkout = new Hono<Env>();

checkout.get('/checkout/config', async (c) => {
  return jsonOk(c, {
    shippingFee: Number(c.env.SHIPPING_FEE_AMOUNT || 500),
    freeShippingThreshold: Number(c.env.FREE_SHIPPING_THRESHOLD || 5000)
  });
});

type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  provider_product_id: string | null;
  image_r2_key: string | null;
};

type CheckoutItem = {
  variantId: number;
  quantity: number;
};

const normalizeEmail = (value: unknown) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isValidEmail = (value: string) => {
  if (value.length > 254) return false;
  return value.includes('@');
};

const jsonErrorWithCode = (c: Context, code: string, message: string, status: number = 500) => {
  console.error(message);
  return c.json({ ok: false, message, error: { code, message } }, status as 400 | 500);
};

const validateItem = (item: unknown): CheckoutItem | null => {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const variantId = Number(obj.variantId);
  const quantity = Number(obj.quantity ?? 1);
  if (!Number.isInteger(variantId) || variantId <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  return { variantId, quantity };
};

checkout.post('/checkout/session', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY ?? (c.env as any).STRIPE_API_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonErrorWithCode(
      c,
      'STRIPE_SECRET_KEY_INVALID',
      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_API_KEY with an sk* value.',
      500
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const email = normalizeEmail(body?.email);
  if (email && !isValidEmail(email)) {
    return jsonError(c, 'Invalid email', 400);
  }

  // Support both single item (backward compat) and multiple items
  let items: CheckoutItem[] = [];
  if (Array.isArray(body?.items)) {
    for (const rawItem of body.items) {
      const item = validateItem(rawItem);
      if (!item) {
        return jsonError(c, 'Invalid item in items array', 400);
      }
      items.push(item);
    }
  } else if (body?.variantId !== undefined) {
    // Backward compatibility: single variantId
    const item = validateItem({ variantId: body.variantId, quantity: body.quantity });
    if (!item) {
      return jsonError(c, 'Invalid variantId or quantity', 400);
    }
    items.push(item);
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
            pi.r2_key as image_r2_key
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     LEFT JOIN product_images pi ON pi.product_id = p.id
       AND pi.position = (SELECT MIN(position) FROM product_images WHERE product_id = p.id)
     WHERE v.id IN (${placeholders})
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<VariantPriceRow>();

  // Build map of variant_id -> price row (latest price per variant)
  const variantMap = new Map<number, VariantPriceRow>();
  for (const row of variantRows.results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }

  // Validate all variants exist and ensure Stripe prices are configured
  for (const item of items) {
    const row = variantMap.get(item.variantId);
    if (!row) {
      return jsonErrorWithCode(c, 'VARIANT_NOT_FOUND', `Variant ${item.variantId} not found`, 404);
    }
    if (!row.provider_price_id?.trim()) {
      try {
        const baseUrl = c.env.STOREFRONT_BASE_URL || 'http://localhost:4321';
        const imageUrl = row.image_r2_key
          ? `${baseUrl}/r2?key=${encodeURIComponent(row.image_r2_key)}`
          : null;

        const stripePriceId = await ensureStripePriceForVariant(c.env.DB, stripeKey, row, imageUrl);
        variantMap.set(item.variantId, { ...row, provider_price_id: stripePriceId });
      } catch (err) {
        console.error(`Failed to create Stripe price for variant ${item.variantId}:`, err);
        return jsonErrorWithCode(
          c,
          'STRIPE_PRICE_CREATION_FAILED',
          `Failed to create Stripe price for variant ${item.variantId}`,
          500
        );
      }
    }
  }

  // Customer handling
  let customerId: number | null = null;
  if (email) {
    const existingCustomer = await c.env.DB.prepare(
      `SELECT id FROM customers WHERE email=?`
    ).bind(email).first<{ id: number }>();
    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
    } else {
      const res = await c.env.DB.prepare(
        `INSERT INTO customers (name, email, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      ).bind('Storefront Customer', email).run();
      customerId = Number(res.meta.last_row_id);
    }
  }

  // Calculate total from all items
  let totalNet = 0;
  let currency = 'JPY';
  for (const item of items) {
    const row = variantMap.get(item.variantId)!;
    totalNet += row.amount * item.quantity;
    currency = (row.currency || 'JPY').toUpperCase();
  }

  // Coupon validation and discount calculation
  const couponCode = body?.couponCode?.trim() || '';
  let discountAmount = 0;
  let couponId: number | null = null;

  if (couponCode) {
    type CouponRow = {
      id: number;
      code: string;
      type: 'percentage' | 'fixed';
      value: number;
      currency: string;
      min_order_amount: number | null;
      max_uses: number | null;
      current_uses: number;
      status: string;
      starts_at: string | null;
      expires_at: string | null;
    };

    const coupon = await c.env.DB.prepare(
      `SELECT id, code, type, value, currency, min_order_amount,
              max_uses, current_uses, status, starts_at, expires_at
       FROM coupons
       WHERE code = ?`
    ).bind(couponCode).first<CouponRow>();

    if (!coupon || coupon.status !== 'active') {
      return jsonError(c, 'Invalid or inactive coupon', 400);
    }

    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return jsonError(c, 'Coupon not yet valid', 400);
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
      return jsonError(c, 'Coupon has expired', 400);
    }

    if (coupon.min_order_amount && totalNet < coupon.min_order_amount) {
      return jsonError(c, `Minimum order amount of ${coupon.min_order_amount} required`, 400);
    }

    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return jsonError(c, 'Coupon usage limit reached', 400);
    }

    // Calculate discount
    if (coupon.type === 'percentage') {
      discountAmount = Math.floor(totalNet * coupon.value / 100);
    } else {
      discountAmount = Math.min(coupon.value, totalNet);
    }

    couponId = coupon.id;
  }

  // Shipping fee calculation
  const shippingFee = Number(c.env.SHIPPING_FEE_AMOUNT || 500);
  const freeThreshold = Number(c.env.FREE_SHIPPING_THRESHOLD || 5000);
  const actualShippingFee = totalNet >= freeThreshold ? 0 : shippingFee;

  // Create order
  const orderRes = await c.env.DB.prepare(
    `INSERT INTO orders (customer_id, status, total_net, total_discount, shipping_fee, coupon_code, total_fee, currency, metadata, created_at, updated_at)
     VALUES (?, 'pending', ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    customerId,
    totalNet,
    discountAmount,
    actualShippingFee,
    couponCode || null,
    currency,
    JSON.stringify({
      source: 'storefront',
      email,
      items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }))
    })
  ).run();

  const orderId = Number(orderRes.meta.last_row_id);

  // Insert all order items
  for (const item of items) {
    const row = variantMap.get(item.variantId)!;
    await c.env.DB.prepare(
      `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      orderId,
      item.variantId,
      item.quantity,
      row.amount,
      JSON.stringify({ product_id: row.product_id })
    ).run();
  }

  // NOTE: Coupon usage is NOT recorded here (would create phantom records for abandoned carts)
  // Instead, it's recorded in the Stripe webhook handler after successful payment

  // Build Stripe checkout session
  const baseUrl = c.env.STOREFRONT_BASE_URL || 'http://localhost:4321';
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/checkout/cancel`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);

  // Add line items for each cart item
  items.forEach((item, index) => {
    const row = variantMap.get(item.variantId)!;
    params.set(`line_items[${index}][price]`, row.provider_price_id!.trim());
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  let lineItemIndex = items.length;

  // Add shipping fee line item
  if (actualShippingFee > 0) {
    params.set(`line_items[${lineItemIndex}][price_data][currency]`, currency.toLowerCase());
    params.set(`line_items[${lineItemIndex}][price_data][product_data][name]`, '配送料');
    params.set(`line_items[${lineItemIndex}][price_data][unit_amount]`, String(actualShippingFee));
    params.set(`line_items[${lineItemIndex}][quantity]`, '1');
  }

  // NOTE: Discount is NOT added as negative line_item (Stripe rejects negative amounts)
  // Instead, discount is recorded in order metadata and displayed in storefront

  // Enable shipping address and phone number collection
  params.set('shipping_address_collection[allowed_countries][0]', 'JP');
  params.set('phone_number_collection[enabled]', 'true');

  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  if (couponCode) {
    params.set('metadata[couponCode]', couponCode);
    params.set('metadata[discountAmount]', String(discountAmount));
    params.set('metadata[couponId]', String(couponId));
  }
  params.set('metadata[shippingFee]', String(actualShippingFee));
  params.set('payment_intent_data[metadata][orderId]', String(orderId));
  params.set('payment_intent_data[metadata][order_id]', String(orderId));
  if (email) params.set('customer_email', email);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    console.error(text);
    return jsonError(c, 'Failed to create checkout session', 500);
  }

  const session = await stripeRes.json<any>();
  if (!session?.url || !session?.id) {
    return jsonError(c, 'Invalid checkout session', 500);
  }

  await c.env.DB.prepare(
    `UPDATE orders SET provider_checkout_session_id=?, updated_at=datetime('now') WHERE id=?`
  ).bind(session.id, orderId).run();

  return jsonOk(c, { url: session.url, orderId });
});

export default checkout;
