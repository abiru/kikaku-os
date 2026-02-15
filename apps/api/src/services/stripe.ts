import type { D1Database } from '@cloudflare/workers-types';
import { AppError } from '../lib/errors';
import { createLogger } from '../lib/logger';

const logger = createLogger('stripe');

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

/**
 * Strip HTML tags from a string and normalize whitespace
 * Returns plain text suitable for Stripe product descriptions
 */
const stripHtml = (html: string | null | undefined): string | null => {
  if (!html) return null;
  // Remove HTML tags
  const text = html.replace(/<[^>]*>/g, ' ');
  // Normalize whitespace (multiple spaces, newlines, tabs -> single space)
  const normalized = text.replace(/\s+/g, ' ').trim();
  // Return null for empty result to avoid sending empty descriptions
  if (normalized.length === 0) return null;
  // Stripe description limit is 500 chars
  return normalized.length > 500 ? normalized.slice(0, 497) + '...' : normalized;
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
    const statusCode = res.status >= 500 ? 502 : 400;
    throw new AppError(`Stripe API error: ${res.status} - ${text}`, {
      statusCode,
      code: 'STRIPE_API_ERROR'
    });
  }

  return res.json() as Promise<T>;
};

export const ensureStripeProduct = async (
  db: D1Database,
  stripeKey: string,
  product: ProductInfo,
  imageUrl?: string | null
): Promise<string> => {
  const plainDescription = stripHtml(product.description);

  // Update existing product with image and description if provided
  if (product.provider_product_id) {
    const updateParams = new URLSearchParams();
    let needsUpdate = false;

    if (imageUrl) {
      updateParams.set('images[0]', imageUrl);
      needsUpdate = true;
    }
    if (plainDescription) {
      updateParams.set('description', plainDescription);
      needsUpdate = true;
    }

    if (needsUpdate) {
      try {
        await stripeRequest<StripeProductResponse>(
          stripeKey,
          `/products/${product.provider_product_id}`,
          updateParams
        );
      } catch (err) {
        logger.error(`Failed to update Stripe product ${product.provider_product_id}`, { error: String(err) });
        // Continue without failing - update is not critical
      }
    }
    return product.provider_product_id;
  }

  const params = new URLSearchParams();
  params.set('name', product.title);
  if (plainDescription) {
    params.set('description', plainDescription);
  }
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
    throw AppError.notFound(`Product ${variant.product_id} not found`);
  }

  const stripeProductId = await ensureStripeProduct(db, stripeKey, product, imageUrl);
  const stripePriceId = await ensureStripePrice(db, stripeKey, variant, stripeProductId);

  return stripePriceId;
};
