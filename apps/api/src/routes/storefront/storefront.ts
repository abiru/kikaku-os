import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk } from '../../lib/http';
import { storefrontProductsQuerySchema } from '../../lib/schemas';

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
  on_hand: number;
};

type StorefrontVariant = {
  id: number;
  title: string;
  sku: string | null;
  stock: number;
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

const isDirectAssetUrl = (value: string): boolean => {
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
};

const resolveAssetUrl = (assetKey: string, baseUrl: string): string => {
  if (isDirectAssetUrl(assetKey)) return assetKey;
  return `${baseUrl}/r2?key=${encodeURIComponent(assetKey)}`;
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
      const imageUrls = sortedImages.map(img => resolveAssetUrl(img.r2Key, baseUrl));

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

    // Variant handling
    if (seenVariant.has(row.variant_id)) continue;
    seenVariant.add(row.variant_id);
    products.get(row.product_id)?.variants.push({
      id: row.variant_id,
      title: row.variant_title,
      sku: row.sku,
      stock: row.on_hand,
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
         pi.position as image_position,
         COALESCE(SUM(inv.delta), 0) as on_hand
  FROM products p
  JOIN variants v ON v.product_id = p.id
  JOIN prices pr ON pr.variant_id = v.id
  LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
  LEFT JOIN product_images pi ON pi.product_id = p.id
  LEFT JOIN inventory_movements inv ON inv.variant_id = v.id
`;

const groupByClause = `GROUP BY p.id, v.id, pr.id, pi.id, tr.id`;

storefront.get('/products', zValidator('query', storefrontProductsQuerySchema), async (c) => {
  const { q, category, minPrice, maxPrice, sort, page, perPage } = c.req.valid('query');

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

  // Get total count of matching products (distinct products, not rows)
  const countSql = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM products p
    JOIN variants v ON v.product_id = p.id
    JOIN prices pr ON pr.variant_id = v.id
    ${whereClause}
  `;

  const countStmt = bindings.length > 0
    ? c.env.DB.prepare(countSql).bind(...bindings)
    : c.env.DB.prepare(countSql);

  const countResult = await countStmt.first<{ total: number }>();
  const totalCount = countResult?.total ?? 0;
  const totalPages = Math.ceil(totalCount / perPage);

  // Get paginated products
  // Note: We need to get ALL rows for the products on this page due to the denormalized structure
  // Then we'll filter to only the products for this page
  const offset = (page - 1) * perPage;

  // Determine sort order
  const sortOrderMap: Record<string, string> = {
    newest: 'p.created_at DESC',
    price_asc: 'MIN(pr.amount) ASC',
    price_desc: 'MAX(pr.amount) DESC',
  };
  const sortOrder = sortOrderMap[sort] || 'p.created_at DESC';
  const needsGroup = sort === 'price_asc' || sort === 'price_desc';

  // First, get the product IDs for this page
  const productIdsSql = needsGroup
    ? `
    SELECT p.id
    FROM products p
    JOIN variants v ON v.product_id = p.id
    JOIN prices pr ON pr.variant_id = v.id
    ${whereClause}
    GROUP BY p.id
    ORDER BY ${sortOrder}
    LIMIT ? OFFSET ?
  `
    : `
    SELECT DISTINCT p.id
    FROM products p
    JOIN variants v ON v.product_id = p.id
    JOIN prices pr ON pr.variant_id = v.id
    ${whereClause}
    ORDER BY ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const productIdsStmt = bindings.length > 0
    ? c.env.DB.prepare(productIdsSql).bind(...bindings, perPage, offset)
    : c.env.DB.prepare(productIdsSql).bind(perPage, offset);

  const productIdsResult = await productIdsStmt.all<{ id: number }>();
  const productIds = productIdsResult.results?.map(r => r.id) || [];

  if (productIds.length === 0) {
    return jsonOk(c, {
      products: [],
      query: q || null,
      filters: {
        category: category || null,
        minPrice: minPrice ?? null,
        maxPrice: maxPrice ?? null
      },
      meta: {
        page,
        perPage,
        totalCount,
        totalPages
      }
    });
  }

  // Now get all data for these specific products
  const placeholders = productIds.map(() => '?').join(',');
  const sql = baseQuery + ` WHERE p.id IN (${placeholders}) ${groupByClause} ORDER BY p.created_at DESC, v.id, pr.id DESC, pi.position ASC`;
  const res = await c.env.DB.prepare(sql).bind(...productIds).all<StorefrontRow>();

  const baseUrl = new URL(c.req.url).origin;
  let products = rowsToProducts(res.results || [], baseUrl);

  // Re-sort products to match the order from productIds query
  const idOrder = new Map(productIds.map((id, idx) => [id, idx]));
  products = [...products].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return jsonOk(c, {
    products,
    query: q || null,
    filters: {
      category: category || null,
      minPrice: minPrice ?? null,
      maxPrice: maxPrice ?? null
    },
    sort,
    meta: {
      page,
      perPage,
      totalCount,
      totalPages
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
    `${baseQuery} WHERE p.id=? AND p.status = 'active' ${groupByClause} ORDER BY p.id, v.id, pr.id DESC, pi.position ASC`
  ).bind(id).all<StorefrontRow>();
  const baseUrl = new URL(c.req.url).origin;
  const products = rowsToProducts(res.results || [], baseUrl);
  return jsonOk(c, { product: products[0] || null });
});

type OrderItemRow = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

type OrderRow = {
  id: number;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  metadata: string | null;
  customer_email: string | null;
  shipping_fee: number;
  total_discount: number;
};

type FulfillmentRow = {
  id: number;
  status: string;
  tracking_number: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

storefront.get('/orders/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return jsonOk(c, { order: null });
  }

  const poll = c.req.query('poll') === 'true';

  // Public endpoint: ONLY allow public_token lookup (no numeric ID to prevent IDOR)
  const order = await c.env.DB.prepare(`
    SELECT o.id, o.status, o.subtotal, o.tax_amount, o.total_amount,
           o.shipping_fee, o.total_discount, o.currency,
           o.created_at, o.paid_at, o.metadata, o.public_token,
           c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.public_token = ?
  `).bind(token).first<OrderRow & { public_token: string | null }>();

  if (!order) {
    return c.json({ ok: false, message: 'Order not found' }, 404);
  }

  // If polling and order is still pending, return 202
  if (poll && order.status === 'pending') {
    return c.json({ ok: true, status: 'pending' }, 202);
  }

  const [itemsRes, fulfillmentsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT p.title as product_title,
             v.title as variant_title,
             oi.quantity,
             oi.unit_price
      FROM order_items oi
      LEFT JOIN variants v ON v.id = oi.variant_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE oi.order_id = ?
    `).bind(order.id).all<OrderItemRow>(),
    c.env.DB.prepare(`
      SELECT id, status, tracking_number, metadata, created_at, updated_at
      FROM fulfillments
      WHERE order_id = ?
      ORDER BY created_at DESC
    `).bind(order.id).all<FulfillmentRow>(),
  ]);

  // Parse shipping info from metadata if available
  let shipping = null;
  if (order.metadata) {
    try {
      const metadata = JSON.parse(order.metadata);
      shipping = metadata.shipping || null;
    } catch {
      // Ignore parse errors
    }
  }

  const fulfillments = (fulfillmentsRes.results || []).map(f => {
    let carrier = null;
    if (f.metadata) {
      try {
        const meta = JSON.parse(f.metadata);
        carrier = meta.carrier || null;
      } catch {
        // Ignore parse errors
      }
    }
    return {
      id: f.id,
      status: f.status,
      tracking_number: f.tracking_number,
      carrier,
      created_at: f.created_at,
      updated_at: f.updated_at,
    };
  });

  return jsonOk(c, {
    order: {
      id: order.id,
      status: order.status,
      subtotal: order.subtotal,
      tax_amount: order.tax_amount,
      total_amount: order.total_amount,
      shipping_fee: order.shipping_fee,
      total_discount: order.total_discount,
      currency: order.currency,
      created_at: order.created_at,
      paid_at: order.paid_at,
      customer_email: order.customer_email,
      shipping,
      fulfillments,
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

// GET /home/heroes - Fetch active hero sections for homepage
type HeroSectionRow = {
  id: number;
  title: string;
  subtitle: string | null;
  image_r2_key: string | null;
  image_r2_key_small: string | null;
  cta_primary_text: string | null;
  cta_primary_url: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  position: number;
};

storefront.get('/home/heroes', async (c) => {
  const res = await c.env.DB.prepare(`
    SELECT id, title, subtitle,
           image_r2_key, image_r2_key_small,
           cta_primary_text, cta_primary_url,
           cta_secondary_text, cta_secondary_url,
           position
    FROM home_hero_sections
    WHERE status = 'active'
    ORDER BY position ASC
  `).all<HeroSectionRow>();

  const baseUrl = new URL(c.req.url).origin;
  const heroes = (res.results || []).map((hero) => ({
    ...hero,
    image: hero.image_r2_key
      ? resolveAssetUrl(hero.image_r2_key, baseUrl)
      : null,
    imageSmall: hero.image_r2_key_small
      ? resolveAssetUrl(hero.image_r2_key_small, baseUrl)
      : null
  }));

  return jsonOk(c, { heroes });
});

// GET /home/featured-categories - Fetch featured products for category grid
type FeaturedProductRow = {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  product_metadata: string | null;
  r2_key: string | null;
};

storefront.get('/home/featured-categories', async (c) => {
  const res = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.description, p.category, p.metadata as product_metadata,
           pi.r2_key
    FROM products p
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.position = 0
    WHERE p.status = 'active' AND p.featured = 1
    ORDER BY p.category, p.created_at DESC
  `).all<FeaturedProductRow>();

  const baseUrl = new URL(c.req.url).origin;
  const products = (res.results || []).map((product) => ({
    ...product,
    image: product.r2_key
      ? resolveAssetUrl(product.r2_key, baseUrl)
      : extractImageUrl(product.product_metadata)
  }));

  return jsonOk(c, { products });
});

export default storefront;
