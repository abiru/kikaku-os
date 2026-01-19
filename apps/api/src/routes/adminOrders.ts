import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError, jsonOk } from "../lib/http";

const adminOrders = new Hono<Env>();

// List Orders
adminOrders.get("/admin/orders", async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');
  const q = c.req.query('q') || '';
  const offset = (page - 1) * perPage;

  try {
    let where = "WHERE 1=1";
    const params: any[] = [];

    if (q) {
      where += " AND (c.email LIKE ? OR o.id LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
    `;
    const countRes = await c.env.DB.prepare(countQuery).bind(...params).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    // Join with payments and refunds could be complex if 1:N.
    // For listing, we assume main payment status or latest.
    // Simplifying to fetch core order data + aggregates.
    const sql = `
      SELECT o.id, o.status, o.total_net, o.currency, o.created_at, o.paid_at,
             c.email as customer_email,
             (SELECT status FROM fulfillments f WHERE f.order_id = o.id LIMIT 1) as fulfillment_status,
             (SELECT COUNT(*) FROM payments p WHERE p.order_id = o.id) as payment_count
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const res = await c.env.DB.prepare(sql).bind(...params, perPage, offset).all();

    return jsonOk(c, {
      orders: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to fetch orders");
  }
});

adminOrders.get("/admin/orders/ready-to-ship", async (c) => {
  try {
    const res = await c.env.DB.prepare(
      `SELECT o.id as order_id,
              c.email as customer_email,
              o.total_net as total,
              o.paid_at as paid_at,
              f.id as fulfillment_id,
              f.status as fulfillment_status
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN fulfillments f ON f.order_id = o.id
       WHERE o.status='paid' AND (f.id IS NULL OR f.status='pending')
       ORDER BY o.paid_at ASC, o.id ASC`,
    )
      .bind()
      .all<{
        order_id: number;
        customer_email: string | null;
        total: number;
        paid_at: string | null;
        fulfillment_id: number | null;
        fulfillment_status: string | null;
      }>();

    return jsonOk(c, { orders: res.results || [] });
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to fetch ready-to-ship orders");
  }
});

export default adminOrders;