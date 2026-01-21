import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../env';
import { jsonOk } from '../lib/http';

const storeProductsQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  category: z.string().max(50).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional()
});

const storefront = new Hono<Env>();

type StorefrontRow = {
  product_id: number;
  product_title: string;
  product_description: string | null;
  product_metadata: string | null;
  tax_rate_id: number | null;
  tax_rate: number | null;
  variant_id: number;
  variant_title: string;
  sku: string | null;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  image_id: number | null;
  image_r2_key: string | null;
  image_position: number | null;
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
  tax_rate: number | null;
  image: string | null;
  mainImage: string | null;
  images: string[];
  variants: StorefrontVariant[];
};

const extractImageUrl = (metadata: string | null): string | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed.image_url || null;
  } catch {
    return null;
  }
};

const buildR2Url = (r2Key: string, baseUrl: string): string => {
  return `${baseUrl}/r2?key=${encodeURIComponent(r2Key)}`;
};

const rowsToProducts = (rows: StorefrontRow[], baseUrl: string): StorefrontProduct[] => {
  const products = new Map<number, StorefrontProduct>();
  const seenVariant = new Set<number>();
  const productImages = new Map<number, Array<{ r2Key: string; position: number }>>();

  // First pass: collect images
  for (const row of rows) {
    if (row.image_id && row.image_r2_key !== null && row.image_position !== null) {
      if (!productImages.has(row.product_id)) {
        productImages.set(row.product_id, []);
      }
      const existing = productImages.get(row.product_id)!;
      // Avoid duplicates
      if (!existing.some(img => img.r2Key === row.image_r2_key)) {
        existing.push({
          r2Key: row.image_r2_key,
          position: row.image_position
        });
      }
    }
  }

  // Second pass: build products
  for (const row of rows) {
    if (!products.has(row.product_id)) {
      const fallbackImage = extractImageUrl(row.product_metadata);
      const imageList = productImages.get(row.product_id) || [];

      // Sort by position
      const sortedImages = imageList.sort((a, b) => a.position - b.position);

      // Generate R2 URLs
      const imageUrls = sortedImages.map(img => buildR2Url(img.r2Key, baseUrl));

      // Main image: first R2 image or fallback
      const mainImage = imageUrls[0] || fallbackImage;

      // All images array
      const allImages = [...imageUrls];
      if (fallbackImage && !imageUrls.length) {
        allImages.push(fallbackImage);
      }

      products.set(row.product_id, {
        id: row.product_id,
        title: row.product_title,
        description: row.product_description,
        tax_rate: row.tax_rate,
        image: fallbackImage,
        mainImage: mainImage,
        images: allImages,
        variants: []
      });
    }

    // Variant handling (unchanged)
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
         p.metadata as product_metadata,
         p.tax_rate_id as tax_rate_id,
         tr.rate as tax_rate,
         v.id as variant_id,
         v.title as variant_title,
         v.sku as sku,
         pr.id as price_id,
         pr.amount as amount,
         pr.currency as currency,
         pr.provider_price_id as provider_price_id,
         pi.id as image_id,
         pi.r2_key as image_r2_key,
         pi.position as image_position
  FROM products p
  JOIN variants v ON v.product_id = p.id
  JOIN prices pr ON pr.variant_id = v.id
  LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
  LEFT JOIN product_images pi ON pi.product_id = p.id
`;

storefront.get('/products', zValidator('query', storeProductsQuerySchema), async (c) => {
  const { q, category, minPrice, maxPrice } = c.req.valid('query');

  const whereConditions: string[] = [];
  const bindings: (string | number)[] = [];

  // Only show active products on storefront
  whereConditions.push("p.status = ?");
  bindings.push('active');

  if (q) {
    whereConditions.push('(p.title LIKE ? OR p.description LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`);
  }

  if (category) {
    whereConditions.push('p.category = ?');
    bindings.push(category);
  }

  if (minPrice !== undefined) {
    whereConditions.push('pr.amount >= ?');
    bindings.push(minPrice);
  }

  if (maxPrice !== undefined) {
    whereConditions.push('pr.amount <= ?');
    bindings.push(maxPrice);
  }

  const whereClause = whereConditions.length > 0
    ? ` WHERE ${whereConditions.join(' AND ')}`
    : '';

  const sql = baseQuery + whereClause + ` ORDER BY p.id, v.id, pr.id DESC, pi.position ASC`;

  const stmt = bindings.length > 0
    ? c.env.DB.prepare(sql).bind(...bindings)
    : c.env.DB.prepare(sql);

  const res = await stmt.all<StorefrontRow>();
  const baseUrl = new URL(c.req.url).origin;
  const products = rowsToProducts(res.results || [], baseUrl);
  return jsonOk(c, {
    products,
    query: q || null,
    filters: {
      category: category || null,
      minPrice: minPrice ?? null,
      maxPrice: maxPrice ?? null
    }
  });
});

type CategoryRow = { category: string | null };
type PriceRangeRow = { minPrice: number | null; maxPrice: number | null };

storefront.get('/products/filters', async (c) => {
  const categoriesRes = await c.env.DB.prepare(`
    SELECT DISTINCT category FROM products
    WHERE category IS NOT NULL AND status = 'active'
    ORDER BY category
  `).all<CategoryRow>();

  const priceRange = await c.env.DB.prepare(`
    SELECT MIN(pr.amount) as minPrice, MAX(pr.amount) as maxPrice
    FROM prices pr
    JOIN variants v ON v.id = pr.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE p.status = 'active'
  `).first<PriceRangeRow>();

  return jsonOk(c, {
    categories: categoriesRes.results?.map(r => r.category).filter(Boolean) || [],
    priceRange: {
      min: priceRange?.minPrice ?? 0,
      max: priceRange?.maxPrice ?? 100000
    }
  });
});

storefront.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonOk(c, { product: null });
  }
  const res = await c.env.DB.prepare(
    `${baseQuery} WHERE p.id=? AND p.status = 'active' ORDER BY p.id, v.id, pr.id DESC, pi.position ASC`
  ).bind(id).all<StorefrontRow>();
  const baseUrl = new URL(c.req.url).origin;
  const products = rowsToProducts(res.results || [], baseUrl);
  return jsonOk(c, { product: products[0] || null });
});

type OrderBySessionRow = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  created_at: string;
  customer_email: string | null;
};

type OrderItemRow = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

storefront.get('/orders/by-session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  if (!sessionId || sessionId.length < 10) {
    return jsonOk(c, { order: null });
  }

  const order = await c.env.DB.prepare(`
    SELECT o.id, o.status, o.total_net, o.currency, o.created_at,
           c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.provider_checkout_session_id = ?
  `).bind(sessionId).first<OrderBySessionRow>();

  if (!order) {
    return jsonOk(c, { order: null });
  }

  const itemsRes = await c.env.DB.prepare(`
    SELECT p.title as product_title,
           v.title as variant_title,
           oi.quantity,
           oi.unit_price
    FROM order_items oi
    LEFT JOIN variants v ON v.id = oi.variant_id
    LEFT JOIN products p ON p.id = v.product_id
    WHERE oi.order_id = ?
  `).bind(order.id).all<OrderItemRow>();

  return jsonOk(c, {
    order: {
      id: order.id,
      status: order.status,
      total_net: order.total_net,
      currency: order.currency,
      created_at: order.created_at,
      customer_email: order.customer_email,
      items: (itemsRes.results || []).map(item => ({
        title: item.variant_title !== 'Default'
          ? `${item.product_title} - ${item.variant_title}`
          : item.product_title,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))
    }
  });
});

// GET /pages/:slug - Fetch published static page by slug
type StaticPageRow = {
  id: number;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  body: string;
  status: string;
  updated_at: string;
};

storefront.get('/pages/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || slug.length < 1 || slug.length > 100) {
    return jsonOk(c, { page: null });
  }

  const page = await c.env.DB.prepare(`
    SELECT id, slug, title, meta_title, meta_description, body, status, updated_at
    FROM static_pages
    WHERE slug = ? AND status = 'published'
  `).bind(slug).first<StaticPageRow>();

  return jsonOk(c, { page: page || null });
});

export default storefront;
