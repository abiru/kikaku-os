import { Hono } from 'hono';
import type { Env } from '../../env';
import { ensureDate } from '../../lib/date';
import { jsonError, jsonOk } from '../../lib/http';
import { generatePublicToken } from '../../lib/token';
import {
  type ProductSeedDef,
  HERO_IMAGE_PAIRS,
  HERO_TEMPLATES,
  ADDITIONAL_PRODUCTS,
  REVIEW_DEFS,
  INQUIRY_DEFS,
  getStaticPageBody,
  ensureImageMetadata,
  seedProductWithVariant
} from './seedData';

type SeedRequest = {
  date?: string;
  orders?: number;
  payments?: number;
  refunds?: number;
  makeInbox?: boolean;
  withImages?: boolean;
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

// Block all dev routes in production
dev.use('*', async (c, next) => {
  if (c.env.DEV_MODE !== 'true') {
    return jsonError(c, 'Not found', 404);
  }
  await next();
});

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
  const withImages = payload.withImages ?? true;

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

    const productTitle = 'LEDパネルライト スタンダード';
    const variantSku = 'LED-PNL-STD';
    const baseProductImageUrl = '/seed/products/led-panel-standard.svg';
    const existingProduct = await c.env.DB.prepare(
      `SELECT id, metadata FROM products WHERE title=?`
    ).bind(productTitle).first<{ id: number; metadata: string | null }>();
    let productId = existingProduct?.id;
    let productCreated = 0;
    let productMetadataUpdated = 0;
    const baseProductMetadata = ensureImageMetadata(
      existingProduct?.metadata ?? null,
      withImages ? baseProductImageUrl : ''
    );
    if (!productId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO products (title, description, status, category, featured, metadata, created_at, updated_at) VALUES (?, ?, 'active', 'LED照明', 1, ?, ?, ?)`
      ).bind(
        productTitle,
        '高品質LEDパネルライト。自然光に近い演色性で目に優しい設計。',
        withImages ? baseProductMetadata.metadata : null,
        orderTime,
        orderTime
      ).run();
      productId = Number(res.meta.last_row_id);
      productCreated = 1;
      if (withImages) productMetadataUpdated += 1;
    } else if (withImages && baseProductMetadata.changed) {
      await c.env.DB.prepare(
        `UPDATE products SET metadata=?, updated_at=? WHERE id=?`
      ).bind(baseProductMetadata.metadata, orderTime, productId).run();
      productMetadataUpdated += 1;
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

    // --- 在庫: 既存商品 ---
    const existingMovement = await c.env.DB.prepare(
      `SELECT id FROM inventory_movements WHERE variant_id=? AND reason='seed_initial_stock'`
    ).bind(variantId).first<{ id: number }>();
    let baseInventoryCreated = 0;
    if (!existingMovement) {
      await c.env.DB.prepare(
        `INSERT INTO inventory_movements (variant_id, delta, reason, created_at, updated_at) VALUES (?, 20, 'seed_initial_stock', ?, ?)`
      ).bind(variantId, orderTime, orderTime).run();
      baseInventoryCreated = 1;
    }

    // --- 税率マスタ ---
    let taxRatesCreated = 0;
    const existingStandardRate = await c.env.DB.prepare(
      `SELECT id FROM tax_rates WHERE name='標準税率'`
    ).first<{ id: number }>();
    if (!existingStandardRate) {
      await c.env.DB.prepare(
        `INSERT INTO tax_rates (name, rate, applicable_from, is_active, description, created_at, updated_at) VALUES ('標準税率', 0.10, '2019-10-01', 1, '標準消費税（10%）', ?, ?)`
      ).bind(orderTime, orderTime).run();
      taxRatesCreated += 1;
    }
    const existingReducedRate = await c.env.DB.prepare(
      `SELECT id FROM tax_rates WHERE name='軽減税率'`
    ).first<{ id: number }>();
    if (!existingReducedRate) {
      await c.env.DB.prepare(
        `INSERT INTO tax_rates (name, rate, applicable_from, is_active, description, created_at, updated_at) VALUES ('軽減税率', 0.08, '2019-10-01', 1, '食品・飲料向け軽減税率（8%）', ?, ?)`
      ).bind(orderTime, orderTime).run();
      taxRatesCreated += 1;
    }

    // --- 追加商品（5商品） ---
    const additionalProducts: ReadonlyArray<ProductSeedDef> = withImages
      ? ADDITIONAL_PRODUCTS
      : ADDITIONAL_PRODUCTS.map((p) => ({ ...p, imageUrl: '' }));

    let additionalProductsCreated = 0;
    let additionalVariantsCreated = 0;
    let additionalPricesCreated = 0;
    let additionalInventoryCreated = 0;
    let additionalMetadataUpdated = 0;
    for (const def of additionalProducts) {
      const result = await seedProductWithVariant(c.env.DB, def, orderTime);
      additionalProductsCreated += result.productCreated;
      additionalVariantsCreated += result.variantCreated;
      additionalPricesCreated += result.priceCreated;
      additionalInventoryCreated += result.inventoryCreated;
      additionalMetadataUpdated += result.metadataUpdated;
    }

    // --- ヒーローセクション ---
    let heroSectionsCreated = 0;
    let heroSectionImagesUpdated = 0;

    const existingHeroesRes = await c.env.DB.prepare(
      `SELECT id, image_r2_key, image_r2_key_small
       FROM home_hero_sections
       ORDER BY position ASC, id ASC`
    ).all<{ id: number; image_r2_key: string | null; image_r2_key_small: string | null }>();
    const existingHeroes = existingHeroesRes.results ?? [];

    for (let i = 0; i < HERO_IMAGE_PAIRS.length; i += 1) {
      const template = HERO_TEMPLATES[i];
      const imagePair = HERO_IMAGE_PAIRS[i];
      const existingHero = existingHeroes[i];

      if (!existingHero) {
        await c.env.DB.prepare(
          `INSERT INTO home_hero_sections
           (title, subtitle, image_r2_key, image_r2_key_small, cta_primary_text, cta_primary_url, position, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        ).bind(
          template.title,
          template.subtitle,
          withImages ? imagePair.main : null,
          withImages ? imagePair.small : null,
          template.ctaPrimaryText,
          template.ctaPrimaryUrl,
          i + 1,
          orderTime,
          orderTime
        ).run();
        heroSectionsCreated += 1;
        if (withImages) heroSectionImagesUpdated += 1;
        continue;
      }

      if (!withImages) continue;

      const nextMain = existingHero.image_r2_key || imagePair.main;
      const nextSmall = existingHero.image_r2_key_small || imagePair.small;
      const shouldUpdate =
        nextMain !== existingHero.image_r2_key || nextSmall !== existingHero.image_r2_key_small;

      if (shouldUpdate) {
        await c.env.DB.prepare(
          `UPDATE home_hero_sections
           SET image_r2_key=?, image_r2_key_small=?, updated_at=?
           WHERE id=?`
        ).bind(nextMain, nextSmall, orderTime, existingHero.id).run();
        heroSectionImagesUpdated += 1;
      }
    }

    // --- クーポン ---
    let couponsCreated = 0;
    const existingWelcome = await c.env.DB.prepare(
      `SELECT id FROM coupons WHERE code='WELCOME10'`
    ).first<{ id: number }>();
    if (!existingWelcome) {
      await c.env.DB.prepare(
        `INSERT INTO coupons (code, type, value, currency, min_order_amount, max_uses, status, created_at, updated_at) VALUES ('WELCOME10', 'percentage', 10, 'JPY', 5000, 100, 'active', ?, ?)`
      ).bind(orderTime, orderTime).run();
      couponsCreated += 1;
    }
    const existingSave = await c.env.DB.prepare(
      `SELECT id FROM coupons WHERE code='SAVE500'`
    ).first<{ id: number }>();
    if (!existingSave) {
      await c.env.DB.prepare(
        `INSERT INTO coupons (code, type, value, currency, min_order_amount, max_uses, status, created_at, updated_at) VALUES ('SAVE500', 'fixed', 500, 'JPY', 3000, 50, 'active', ?, ?)`
      ).bind(orderTime, orderTime).run();
      couponsCreated += 1;
    }

    // --- レビュー ---
    let reviewsCreated = 0;
    const existingReviews = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM reviews WHERE product_id=?`
    ).bind(productId).first<{ count: number }>();
    if ((existingReviews?.count ?? 0) === 0) {
      for (const r of REVIEW_DEFS) {
        await c.env.DB.prepare(
          `INSERT INTO reviews (product_id, customer_email, customer_name, rating, title, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(productId, r.email, r.name, r.rating, r.title, r.body, r.status, orderTime, orderTime).run();
        reviewsCreated += 1;
      }
    }

    // --- お問い合わせ ---
    let contactInquiriesCreated = 0;
    const existingInquiries = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM contact_inquiries`
    ).first<{ count: number }>();
    if ((existingInquiries?.count ?? 0) === 0) {
      for (const inq of INQUIRY_DEFS) {
        await c.env.DB.prepare(
          `INSERT INTO contact_inquiries (name, email, subject, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(inq.name, inq.email, inq.subject, inq.body, inq.status, orderTime, orderTime).run();
        contactInquiriesCreated += 1;
      }
    }

    // --- 固定ページ（draft → published に更新） ---
    let staticPagesUpdated = 0;
    const draftPages = await c.env.DB.prepare(
      `SELECT slug FROM static_pages WHERE status='draft'`
    ).all<{ slug: string }>();
    for (const page of draftPages.results ?? []) {
      const body = getStaticPageBody(page.slug);
      if (body) {
        await c.env.DB.prepare(
          `UPDATE static_pages SET status='published', body=?, updated_at=? WHERE slug=?`
        ).bind(body, orderTime, page.slug).run();
        staticPagesUpdated += 1;
      }
    }

    const orders: Array<{ id: number; totalNet: number }> = [];
    for (let i = 0; i < ordersCount; i += 1) {
      const totalNet = randInt(10000, 50000);
      const status = i === 0 ? 'fulfilled' : 'paid';
      const res = await c.env.DB.prepare(
        `INSERT INTO orders (customer_id, status, total_net, total_fee, currency, public_token, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'JPY', ?, ?, ?)`
      ).bind(customerId, status, totalNet, generatePublicToken(), orderTime, orderTime).run();
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
      withImages,
      created: {
        customers: customerCreated,
        products: productCreated + additionalProductsCreated,
        variants: variantCreated + additionalVariantsCreated,
        prices: priceCreated + additionalPricesCreated,
        orders: orders.length,
        payments: payments.length,
        refunds: refundsCreated,
        inbox: inboxCreated,
        taxRates: taxRatesCreated,
        heroSections: heroSectionsCreated,
        coupons: couponsCreated,
        reviews: reviewsCreated,
        contactInquiries: contactInquiriesCreated,
        staticPages: staticPagesUpdated,
        inventoryMovements: baseInventoryCreated + additionalInventoryCreated,
        images: productMetadataUpdated + additionalMetadataUpdated + heroSectionImagesUpdated
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to seed');
  }
});

dev.post('/provision-stripe-prices', async (c) => {
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
