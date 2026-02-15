/**
 * Stripe price provisioning logic extracted from the /dev/provision-stripe-prices endpoint.
 *
 * Creates Stripe products and prices for local variants that lack a provider_price_id.
 */

import { createLogger } from '../lib/logger';

const logger = createLogger('stripeProvision');

type StripeProvisionRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
};

type ProvisionError = {
  price_id: number;
  variant_id: number;
  message: string;
};

export type ProvisionResult = {
  updated_count: number;
  skipped_already_configured_count: number;
  skipped_missing_mapping_count: number;
  errors_count: number;
  errors: ProvisionError[];
};

async function readStripeErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json<{ error?: { message?: string } }>();
    const message = data?.error?.message;
    if (message && typeof message === 'string') return message.slice(0, 160);
  } catch {
    // ignore JSON parse failures
  }
  return `${fallback} (status ${res.status})`;
}

export async function provisionStripePrices(
  db: D1Database,
  stripeKey: string
): Promise<ProvisionResult> {
  const rowsRes = await db.prepare(
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

  const configuredCountRes = await db.prepare(
    `SELECT COUNT(*) as count
     FROM prices
     WHERE COALESCE(TRIM(provider_price_id), '') != ''`
  ).first<{ count: number }>();

  const missingMappingRes = await db.prepare(
    `SELECT v.id as variant_id
     FROM variants v
     LEFT JOIN prices pr ON pr.variant_id = v.id
     WHERE pr.id IS NULL`
  ).all<{ variant_id: number }>();

  const errors: ProvisionError[] = [];
  const configuredCount = Number(configuredCountRes?.count ?? 0);
  let updatedCount = 0;
  const productCache = new Map<number, string>();

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
            headers: { authorization: `Bearer ${stripeKey}` }
          }
        );

        if (!searchRes.ok) {
          const message = await readStripeErrorMessage(searchRes, 'Failed to search Stripe products');
          errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
          continue;
        }

        const searchResult = await searchRes.json<{ data?: Array<{ id: string }> }>();
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

          const product = await productRes.json<{ id?: string }>();
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

      const price = await priceRes.json<{ id?: string }>();
      if (!price?.id) {
        errors.push({
          price_id: row.price_id,
          variant_id: row.variant_id,
          message: 'Stripe price response missing id'
        });
        continue;
      }

      await db.prepare(
        `UPDATE prices SET provider_price_id=?, updated_at=datetime('now') WHERE id=?`
      ).bind(price.id, row.price_id).run();

      updatedCount += 1;
    } catch (err) {
      logger.error('Unexpected error provisioning Stripe price', {
        price_id: row.price_id,
        variant_id: row.variant_id,
        error: err instanceof Error ? err.message : String(err),
      });
      errors.push({
        price_id: row.price_id,
        variant_id: row.variant_id,
        message: 'Unexpected error provisioning Stripe price'
      });
    }
  }

  return {
    updated_count: updatedCount,
    skipped_already_configured_count: configuredCount,
    skipped_missing_mapping_count: missingMappingRes.results?.length ?? 0,
    errors_count: errors.length,
    errors
  };
}
