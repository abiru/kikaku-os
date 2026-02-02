import { Hono } from 'hono';
import type { Env } from '../../env';
import { ensureDate } from '../../lib/date';
import { jsonError, jsonOk } from '../../lib/http';

type SeedRequest = {
  date?: string;
  orders?: number;
  payments?: number;
  refunds?: number;
  makeInbox?: boolean;
};

type StripeProvisionRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
};

const dev = new Hono<Env>();

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const randInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

dev.get('/ping', (c) => {
  return jsonOk(c, {
    name: 'kikaku-os-api',
    time: new Date().toISOString(),
    dev_mode: c.env.DEV_MODE === 'true'
  });
});

dev.get('/tmux-test', (c) => {
  return jsonOk(c, {
    name: 'tmux-test',
    timestamp: new Date().toISOString(),
    env: c.env.DEV_MODE === 'true' ? 'development' : 'production',
    message: 'tmux automation test endpoint'
  });
});

dev.post('/seed', async (c) => {
  if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);

  let payload: SeedRequest = {};
  try {
    payload = await c.req.json();
  } catch {
    payload = {};
  }

  const date = ensureDate(payload.date || yesterday());
  if (!date) return jsonError(c, 'Invalid date', 400);

  const ordersCount = Math.max(0, Math.floor(payload.orders ?? 5));
  const paymentsCount = Math.max(0, Math.floor(payload.payments ?? ordersCount));
  const refundsCount = Math.max(0, Math.floor(payload.refunds ?? 1));
  const makeInbox = payload.makeInbox ?? true;

  const orderTime = `${date}T12:00:00Z`;
  const paymentTime = `${date}T12:10:00Z`;
  const refundTime = `${date}T12:20:00Z`;

  try {
    const customerEmail = 'seed@example.com';
    const existingCustomer = await c.env.DB.prepare(
      `SELECT id FROM customers WHERE email=?`
    ).bind(customerEmail).first<{ id: number }>();
    let customerId = existingCustomer?.id;
    let customerCreated = 0;
    if (!customerId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO customers (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)`
      ).bind('Seed Customer', customerEmail, orderTime, orderTime).run();
      customerId = Number(res.meta.last_row_id);
      customerCreated = 1;
    }

    const productTitle = 'Seed Product';
    const variantSku = 'SEED-SKU';
    const existingProduct = await c.env.DB.prepare(
      `SELECT id FROM products WHERE title=?`
    ).bind(productTitle).first<{ id: number }>();
    let productId = existingProduct?.id;
    let productCreated = 0;
    if (!productId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO products (title, description, created_at, updated_at) VALUES (?, ?, ?, ?)`
      ).bind(productTitle, 'Seed product for local dev', orderTime, orderTime).run();
      productId = Number(res.meta.last_row_id);
      productCreated = 1;
    }

    const existingVariant = await c.env.DB.prepare(
      `SELECT id FROM variants WHERE sku=?`
    ).bind(variantSku).first<{ id: number }>();
    let variantId = existingVariant?.id;
    let variantCreated = 0;
    if (!variantId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO variants (product_id, title, sku, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
      ).bind(productId, 'Default', variantSku, orderTime, orderTime).run();
      variantId = Number(res.meta.last_row_id);
      variantCreated = 1;
    }

    const existingPrice = await c.env.DB.prepare(
      `SELECT id FROM prices WHERE variant_id=? AND currency='JPY'`
    ).bind(variantId).first<{ id: number }>();
    let priceId = existingPrice?.id;
    let priceCreated = 0;
    if (!priceId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO prices (variant_id, currency, amount, created_at, updated_at) VALUES (?, 'JPY', ?, ?, ?)`
      ).bind(variantId, 10000, orderTime, orderTime).run();
      priceId = Number(res.meta.last_row_id);
      priceCreated = 1;
    }

    const orders: Array<{ id: number; totalNet: number }> = [];
    for (let i = 0; i < ordersCount; i += 1) {
      const totalNet = randInt(10000, 50000);
      const status = i === 0 ? 'fulfilled' : 'paid';
      const res = await c.env.DB.prepare(
        `INSERT INTO orders (customer_id, status, total_net, total_fee, currency, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'JPY', ?, ?)`
      ).bind(customerId, status, totalNet, orderTime, orderTime).run();
      const orderId = Number(res.meta.last_row_id);
      orders.push({ id: orderId, totalNet });

      await c.env.DB.prepare(
        `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)`
      ).bind(orderId, variantId, totalNet, orderTime, orderTime).run();
    }

    const payments: Array<{ id: number; amount: number }> = [];
    const paymentsToCreate = orders.length === 0 ? 0 : paymentsCount;
    for (let i = 0; i < paymentsToCreate; i += 1) {
      const source = orders[i % orders.length];
      const amount = source.totalNet;
      const fee = Math.round(amount * 0.03 + 30);
      const providerPaymentId = `pi_seed_${date}_${i + 1}_${crypto.randomUUID()}`;

      const res = await c.env.DB.prepare(
        `INSERT INTO payments (order_id, status, amount, fee, currency, method, provider, provider_payment_id, created_at, updated_at)
         VALUES (?, 'succeeded', ?, ?, 'JPY', 'card', 'stripe', ?, ?, ?)`
      ).bind(source.id, amount, fee, providerPaymentId, paymentTime, paymentTime).run();
      payments.push({ id: Number(res.meta.last_row_id), amount });
    }

    let refundsCreated = 0;
    const refundsToCreate = payments.length === 0 ? 0 : refundsCount;
    for (let i = 0; i < refundsToCreate; i += 1) {
      const payment = payments[i % payments.length];
      const amount = Math.min(payment.amount - 1, randInt(1000, 3000));
      if (amount <= 0) continue;
      await c.env.DB.prepare(
        `INSERT INTO refunds (payment_id, status, amount, currency, reason, created_at, updated_at)
         VALUES (?, 'succeeded', ?, 'JPY', 'seed refund', ?, ?)`
      ).bind(payment.id, amount, refundTime, refundTime).run();
      refundsCreated += 1;
    }

    let inboxCreated = 0;
    if (makeInbox) {
      await c.env.DB.prepare(
        `INSERT INTO inbox_items (title, body, severity, status, created_at, updated_at)
         VALUES (?, ?, 'info', 'open', ?, ?)`
      ).bind(
        'Seed created',
        `date=${date} orders=${ordersCount} payments=${paymentsCount} refunds=${refundsCount}`,
        orderTime,
        orderTime
      ).run();
      inboxCreated = 1;
    }

    return jsonOk(c, {
      date,
      created: {
        customers: customerCreated,
        products: productCreated,
        variants: variantCreated,
        prices: priceCreated,
        orders: orders.length,
        payments: payments.length,
        refunds: refundsCreated,
        inbox: inboxCreated
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to seed');
  }
});

dev.post('/provision-stripe-prices', async (c) => {
  if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);

  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
  if (stripeKey.startsWith('pk_')) {
    return jsonError(
      c,
      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
      500
    );
  }

  const rowsRes = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     WHERE COALESCE(TRIM(pr.provider_price_id), '') = ''
     ORDER BY pr.id ASC`
  ).all<StripeProvisionRow>();

  const configuredCountRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM prices
     WHERE COALESCE(TRIM(provider_price_id), '') != ''`
  ).first<{ count: number }>();

  const missingMappingRes = await c.env.DB.prepare(
    `SELECT v.id as variant_id
     FROM variants v
     LEFT JOIN prices pr ON pr.variant_id = v.id
     WHERE pr.id IS NULL`
  ).all<{ variant_id: number }>();

  const errors: Array<{ price_id: number; variant_id: number; message: string }> = [];
  const configuredCount = Number(configuredCountRes?.count ?? 0);
  let updatedCount = 0;
  const productCache = new Map<number, string>();

  const readStripeErrorMessage = async (res: Response, fallback: string) => {
    try {
      const data = await res.json<any>();
      const message = data?.error?.message;
      if (message && typeof message === 'string') return message.slice(0, 160);
    } catch {
      // ignore JSON parse failures
    }
    return `${fallback} (status ${res.status})`;
  };

  for (const row of rowsRes.results || []) {
    try {
      let productId = productCache.get(row.variant_id);
      if (!productId) {
        const searchParams = new URLSearchParams();
        searchParams.set('query', `metadata['variant_id']:'${row.variant_id}'`);
        const searchRes = await fetch(
          `https://api.stripe.com/v1/products/search?${searchParams.toString()}`,
          {
            method: 'GET',
            headers: {
              authorization: `Bearer ${stripeKey}`
            }
          }
        );

        if (!searchRes.ok) {
          const message = await readStripeErrorMessage(searchRes, 'Failed to search Stripe products');
          errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
          continue;
        }

        const searchResult = await searchRes.json<any>();
        productId = searchResult?.data?.[0]?.id;
        if (!productId) {
          const productParams = new URLSearchParams();
          productParams.set('name', `${row.product_title} - ${row.variant_title}`);
          productParams.set('metadata[variant_id]', String(row.variant_id));
          productParams.set('metadata[product_id]', String(row.product_id));

          const productRes = await fetch('https://api.stripe.com/v1/products', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${stripeKey}`,
              'content-type': 'application/x-www-form-urlencoded'
            },
            body: productParams.toString()
          });

          if (!productRes.ok) {
            const message = await readStripeErrorMessage(productRes, 'Failed to create Stripe product');
            errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
            continue;
          }

          const product = await productRes.json<any>();
          productId = product?.id;
        }

        if (!productId) {
          errors.push({
            price_id: row.price_id,
            variant_id: row.variant_id,
            message: 'Stripe product not available for price provisioning'
          });
          continue;
        }

        productCache.set(row.variant_id, productId);
      }

      const priceParams = new URLSearchParams();
      priceParams.set('unit_amount', String(row.amount));
      priceParams.set('currency', (row.currency || 'JPY').toLowerCase());
      priceParams.set('product', productId);
      priceParams.set('metadata[variant_id]', String(row.variant_id));
      priceParams.set('metadata[price_id]', String(row.price_id));

      const priceRes = await fetch('https://api.stripe.com/v1/prices', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${stripeKey}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: priceParams.toString()
      });

      if (!priceRes.ok) {
        const message = await readStripeErrorMessage(priceRes, 'Failed to create Stripe price');
        errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
        continue;
      }

      const price = await priceRes.json<any>();
      if (!price?.id) {
        errors.push({
          price_id: row.price_id,
          variant_id: row.variant_id,
          message: 'Stripe price response missing id'
        });
        continue;
      }

      await c.env.DB.prepare(
        `UPDATE prices SET provider_price_id=?, updated_at=datetime('now') WHERE id=?`
      ).bind(price.id, row.price_id).run();

      updatedCount += 1;
    } catch (err) {
      console.error(err);
      errors.push({
        price_id: row.price_id,
        variant_id: row.variant_id,
        message: 'Unexpected error provisioning Stripe price'
      });
    }
  }

  return jsonOk(c, {
    updated_count: updatedCount,
    skipped_already_configured_count: configuredCount,
    skipped_missing_mapping_count: missingMappingRes.results?.length ?? 0,
    errors_count: errors.length,
    errors
  });
});

export default dev;
