import { Hono } from 'hono';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';

const app = new Hono<Env>();

app.get('/products', async (c) => {
  const q = c.req.query('q');
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');
  const offset = (page - 1) * perPage;

  try {
    let whereClause = '';
    const bindings: any[] = [];

    if (q) {
      whereClause = 'WHERE title LIKE ? OR description LIKE ?';
      bindings.push(`%${q}%`, `%${q}%`);
    }

    const countQuery = `SELECT COUNT(*) as count FROM products ${whereClause}`;
    const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const dataQuery = `
      SELECT id, title, description, metadata, created_at, updated_at
      FROM products
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    bindings.push(perPage, offset);

    const products = await c.env.DB.prepare(dataQuery).bind(...bindings).all();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      'admin',
      'view_products',
      'admin_products_list',
      JSON.stringify({ q, page, perPage, count: products.results.length })
    ).run();

    return jsonOk(c, {
      products: products.results,
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });

  } catch (e) {
    console.error(e);
    return jsonError(c, 'Failed to fetch products');
  }
});

export default app;