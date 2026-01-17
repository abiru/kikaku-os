import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonOk } from '../lib/http';

const storefront = new Hono<Env>();

type StorefrontRow = {
  product_id: number;
  product_title: string;
  product_description: string | null;
  variant_id: number;
  variant_title: string;
  sku: string | null;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
};

type StorefrontVariant = {
  id: number;
  title: string;
  sku: string | null;
  price: {
    id: number;
    amount: number;
    currency: string;
    provider_price_id: string | null;
  };
};

type StorefrontProduct = {
  id: number;
  title: string;
  description: string | null;
  variants: StorefrontVariant[];
};

const rowsToProducts = (rows: StorefrontRow[]): StorefrontProduct[] => {
  const products = new Map<number, StorefrontProduct>();
  const seenVariant = new Set<number>();

  for (const row of rows) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: row.product_id,
        title: row.product_title,
        description: row.product_description,
        variants: []
      });
    }
    if (seenVariant.has(row.variant_id)) continue;
    seenVariant.add(row.variant_id);
    products.get(row.product_id)?.variants.push({
      id: row.variant_id,
      title: row.variant_title,
      sku: row.sku,
      price: {
        id: row.price_id,
        amount: row.amount,
        currency: row.currency,
        provider_price_id: row.provider_price_id
      }
    });
  }

  return Array.from(products.values());
};

const baseQuery = `
  SELECT p.id as product_id,
         p.title as product_title,
         p.description as product_description,
         v.id as variant_id,
         v.title as variant_title,
         v.sku as sku,
         pr.id as price_id,
         pr.amount as amount,
         pr.currency as currency,
         pr.provider_price_id as provider_price_id
  FROM products p
  JOIN variants v ON v.product_id = p.id
  JOIN prices pr ON pr.variant_id = v.id
`;

storefront.get('/products', async (c) => {
  const res = await c.env.DB.prepare(`${baseQuery} ORDER BY p.id, v.id, pr.id DESC`).all<StorefrontRow>();
  const products = rowsToProducts(res.results || []);
  return jsonOk(c, { products });
});

storefront.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonOk(c, { product: null });
  }
  const res = await c.env.DB.prepare(
    `${baseQuery} WHERE p.id=? ORDER BY p.id, v.id, pr.id DESC`
  ).bind(id).all<StorefrontRow>();
  const products = rowsToProducts(res.results || []);
  return jsonOk(c, { product: products[0] || null });
});

export default storefront;
