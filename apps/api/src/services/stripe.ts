import type { D1Database } from '@cloudflare/workers-types';

type ProductInfo = {
  id: number;
  title: string;
  description?: string | null;
  provider_product_id?: string | null;
};

type VariantPriceInfo = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  provider_product_id?: string | null;
};

type StripeProductResponse = {
  id: string;
  object: string;
};

type StripePriceResponse = {
  id: string;
  object: string;
};

const stripeRequest = async <T>(
  stripeKey: string,
  endpoint: string,
  params: URLSearchParams
): Promise<T> => {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API error: ${res.status} - ${text}`);
  }

  return res.json() as Promise<T>;
};

export const ensureStripeProduct = async (
  db: D1Database,
  stripeKey: string,
  product: ProductInfo,
  imageUrl?: string | null
): Promise<string> => {
  // Update existing product with image if provided
  if (product.provider_product_id && imageUrl) {
    const updateParams = new URLSearchParams();
    updateParams.set('images[0]', imageUrl);

    try {
      await stripeRequest<StripeProductResponse>(
        stripeKey,
        `/products/${product.provider_product_id}`,
        updateParams
      );
    } catch (err) {
      console.error(`Failed to update Stripe product ${product.provider_product_id} with image:`, err);
      // Continue without failing - image update is not critical
    }
  }

  if (product.provider_product_id) {
    return product.provider_product_id;
  }

  const params = new URLSearchParams();
  params.set('name', product.title);
  if (imageUrl) {
    params.set('images[0]', imageUrl);
  }
  params.set('metadata[local_product_id]', String(product.id));

  const stripeProduct = await stripeRequest<StripeProductResponse>(
    stripeKey,
    '/products',
    params
  );

  await db
    .prepare(
      `UPDATE products SET provider_product_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(stripeProduct.id, product.id)
    .run();

  return stripeProduct.id;
};

export const ensureStripePrice = async (
  db: D1Database,
  stripeKey: string,
  variant: VariantPriceInfo,
  stripeProductId: string
): Promise<string> => {
  if (variant.provider_price_id?.trim()) {
    return variant.provider_price_id.trim();
  }

  const currency = (variant.currency || 'JPY').toLowerCase();
  const params = new URLSearchParams();
  params.set('product', stripeProductId);
  params.set('unit_amount', String(variant.amount));
  params.set('currency', currency);
  params.set('metadata[local_price_id]', String(variant.price_id));
  params.set('metadata[local_variant_id]', String(variant.variant_id));

  const nickname = `${variant.product_title} - ${variant.variant_title}`;
  params.set('nickname', nickname);

  const stripePrice = await stripeRequest<StripePriceResponse>(
    stripeKey,
    '/prices',
    params
  );

  await db
    .prepare(
      `UPDATE prices SET provider_price_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(stripePrice.id, variant.price_id)
    .run();

  return stripePrice.id;
};

export const ensureStripePriceForVariant = async (
  db: D1Database,
  stripeKey: string,
  variant: VariantPriceInfo,
  imageUrl?: string | null
): Promise<string> => {
  const product = await db
    .prepare(`SELECT id, title, description, provider_product_id FROM products WHERE id = ?`)
    .bind(variant.product_id)
    .first<ProductInfo>();

  if (!product) {
    throw new Error(`Product ${variant.product_id} not found`);
  }

  const stripeProductId = await ensureStripeProduct(db, stripeKey, product, imageUrl);
  const stripePriceId = await ensureStripePrice(db, stripeKey, variant, stripeProductId);

  return stripePriceId;
};
