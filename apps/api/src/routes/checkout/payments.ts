import { Hono } from 'hono';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { ensureStripeCustomer } from '../../services/stripeCustomer';
import { generatePublicToken } from '../../lib/token';
import { checkStockAvailability } from '../../services/inventoryCheck';

const payments = new Hono<Env>();

payments.post('/payments/intent', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY ?? (c.env as any).STRIPE_API_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonError(c, 'Stripe secret key invalid', 500);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const { quoteId, email } = body;

  if (!quoteId) {
    return jsonError(c, 'quoteId is required', 400);
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return jsonError(c, 'Valid email is required', 400);
  }

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

  // Verify stock availability before proceeding
  const quoteItemsForStock: Array<{ variantId: number; quantity: number }> = JSON.parse(quote.items_json);
  const stockCheck = await checkStockAvailability(
    c.env.DB,
    quoteItemsForStock.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
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

  // Insert order_items from quote items
  const quoteItems: Array<{ variantId: number; quantity: number }> = JSON.parse(quote.items_json);
  for (const item of quoteItems) {
    // Look up variant price and product info
    const variant = await c.env.DB.prepare(
      `SELECT v.id, v.product_id, p.amount as unit_price
       FROM variants v
       LEFT JOIN prices p ON p.variant_id = v.id AND p.is_default = 1
       WHERE v.id = ?`
    ).bind(item.variantId).first<{ id: number; product_id: number; unit_price: number | null }>();

    if (variant) {
      const unitPrice = variant.unit_price ?? 0;
      const lineTotal = unitPrice * item.quantity;
      // Default 10% tax rate (standard Japanese consumption tax)
      const taxRate = 10;
      const taxAmount = Math.floor((lineTotal * taxRate) / (100 + taxRate));

      await c.env.DB.prepare(
        `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, tax_rate, tax_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(orderId, item.variantId, item.quantity, unitPrice, taxRate, taxAmount).run();
    }
  }

  // Create Stripe PaymentIntent
  const params = new URLSearchParams();
  params.set('amount', String(quote.grand_total));
  params.set('currency', quote.currency.toLowerCase());
  params.set('customer', stripeCustomerId!);
  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  params.set('metadata[quoteId]', quoteId);

  // Configure payment method types
  // Bank transfer is always enabled - controlled by Stripe Dashboard settings
  console.log('[PaymentIntent] Configuration:', {
    amount: quote.grand_total,
    currency: quote.currency,
    customer: stripeCustomerId,
    minAmount: 50
  });

  // Check minimum amount for bank transfers (¥50)
  if (quote.grand_total < 50) {
    console.warn('[PaymentIntent] Amount below minimum for bank transfer (¥50), only card will be available');
  }

  // Use automatic payment methods to let Stripe show all available options
  params.set('automatic_payment_methods[enabled]', 'true');
  params.set('automatic_payment_methods[allow_redirects]', 'never');

  // Configure customer_balance for bank transfers (jp_bank_transfer)
  // Actual availability is controlled by Stripe Dashboard settings
  params.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
  params.set('payment_method_options[customer_balance][bank_transfer][type]', 'jp_bank_transfer');

  console.log('[PaymentIntent] Enabled payment methods: card, customer_balance (jp_bank_transfer), wallets (Google Pay, Apple Pay)');

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
    console.error('Stripe PaymentIntent creation failed:', text);
    return jsonError(c, 'Failed to create payment intent', 500);
  }

  const paymentIntent = await stripeRes.json<any>();
  console.log('[PaymentIntent] Created successfully:', {
    id: paymentIntent.id,
    payment_method_types: paymentIntent.payment_method_types,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    customer: paymentIntent.customer,
    payment_method_options: paymentIntent.payment_method_options
  });

  if (!paymentIntent?.client_secret || !paymentIntent?.id) {
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
