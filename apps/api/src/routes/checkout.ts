import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';

const checkout = new Hono<Env>();

type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
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

const jsonErrorWithCode = (c: Context, code: string, message: string, status = 500) => {
  console.error(message);
  return c.json({ ok: false, message, error: { code, message } }, status);
};

checkout.post('/checkout/session', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonErrorWithCode(
      c,
      'STRIPE_SECRET_KEY_INVALID',
      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
      500
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const variantId = Number(body?.variantId);
  const quantity = Number(body?.quantity ?? 1);
  const email = normalizeEmail(body?.email);

  if (!Number.isInteger(variantId) || variantId <= 0) {
    return jsonError(c, 'Invalid variantId', 400);
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return jsonError(c, 'Invalid quantity', 400);
  }
  if (email && !isValidEmail(email)) {
    return jsonError(c, 'Invalid email', 400);
  }

  const variantRow = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency,
            pr.provider_price_id as provider_price_id
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     WHERE v.id=?
     ORDER BY pr.id DESC
     LIMIT 1`
  ).bind(variantId).first<VariantPriceRow>();

  if (!variantRow) {
    const variantExists = await c.env.DB.prepare(
      `SELECT id FROM variants WHERE id=?`
    ).bind(variantId).first<{ id: number }>();
    if (!variantExists) {
      return jsonErrorWithCode(c, 'VARIANT_NOT_FOUND', 'Variant not found', 404);
    }
    return jsonErrorWithCode(
      c,
      'STRIPE_PRICE_NOT_CONFIGURED',
      'Stripe price not configured for this variant',
      400
    );
  }

  const providerPriceId = variantRow.provider_price_id?.trim();
  if (!providerPriceId) {
    return jsonErrorWithCode(
      c,
      'STRIPE_PRICE_NOT_CONFIGURED',
      'Stripe price not configured for this variant',
      400
    );
  }

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

  const totalNet = variantRow.amount * quantity;
  const currency = (variantRow.currency || 'JPY').toUpperCase();

  const orderRes = await c.env.DB.prepare(
    `INSERT INTO orders (customer_id, status, total_net, total_fee, currency, metadata, created_at, updated_at)
     VALUES (?, 'pending', ?, 0, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    customerId,
    totalNet,
    currency,
    JSON.stringify({
      source: 'storefront',
      email,
      variant_id: variantRow.variant_id,
      quantity
    })
  ).run();

  const orderId = Number(orderRes.meta.last_row_id);

  await c.env.DB.prepare(
    `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    orderId,
    variantRow.variant_id,
    quantity,
    variantRow.amount,
    JSON.stringify({ product_id: variantRow.product_id })
  ).run();

  const baseUrl = c.env.STOREFRONT_BASE_URL || 'http://localhost:4321';
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/checkout/cancel`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('line_items[0][price]', providerPriceId);
  params.set('line_items[0][quantity]', String(quantity));
  params.set('metadata[order_id]', String(orderId));
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
