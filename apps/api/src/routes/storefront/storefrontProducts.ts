import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { storefrontProductsQuerySchema } from '../../lib/schemas';
import type { StorefrontRow, CategoryRow, PriceRangeRow } from './storefrontTypes';
import { rowsToProducts, baseQuery, groupByClause } from './storefrontUtils';

const products = new Hono<Env>();

products.get('/products', zValidator('query', storefrontProductsQuerySchema), async (c) => {
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
      sort,
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
  let productList = rowsToProducts(res.results || [], baseUrl);

  // Re-sort products to match the order from productIds query
  const idOrder = new Map(productIds.map((id, idx) => [id, idx]));
  productList = [...productList].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return jsonOk(c, {
    products: productList,
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

products.get('/products/filters', async (c) => {
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

products.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonOk(c, { product: null });
  }
  const res = await c.env.DB.prepare(
    `${baseQuery} WHERE p.id=? AND p.status = 'active' ${groupByClause} ORDER BY p.id, v.id, pr.id DESC, pi.position ASC`
  ).bind(id).all<StorefrontRow>();
  const baseUrl = new URL(c.req.url).origin;
  const productList = rowsToProducts(res.results || [], baseUrl);
  return jsonOk(c, { product: productList[0] || null });
});

// POST /products/:id/notify - Subscribe to restock notifications
const restockNotifySchema = z.object({
  email: z.string().email(),
});

products.post('/products/:id/notify', zValidator('json', restockNotifySchema), async (c) => {
  const productId = c.req.param('id');
  const { email } = c.req.valid('json');

  try {
    const product = await c.env.DB.prepare(
      'SELECT product_id FROM products WHERE product_id = ?'
    ).bind(productId).first();
    if (!product) {
      return jsonError(c, 'Product not found', 404);
    }

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO restock_notifications (product_id, email) VALUES (?, ?)'
    ).bind(productId, email).run();

    return jsonOk(c, { message: 'Subscribed to restock notifications' });
  } catch (error) {
    console.error('Restock notification subscription failed:', error);
    return jsonError(c, 'Failed to subscribe to restock notifications', 500);
  }
});

export default products;
