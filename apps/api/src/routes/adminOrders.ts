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

// Ready to Ship (specific route - must come before :id)
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

// Order Detail
adminOrders.get("/admin/orders/:id", async (c) => {
  const id = parseInt(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError(c, "Invalid order ID", 400);
  }

  try {
    // Get order with customer email
    const order = await c.env.DB.prepare(`
      SELECT o.id, o.status, o.total_net, o.total_fee, o.currency, o.customer_id,
             o.provider_checkout_session_id, o.provider_payment_intent_id,
             o.paid_at, o.created_at, o.updated_at,
             c.email as customer_email, c.name as customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ?
    `).bind(id).first();

    if (!order) {
      return jsonError(c, "Order not found", 404);
    }

    // Get payments for this order
    const paymentsRes = await c.env.DB.prepare(`
      SELECT id, status, amount, fee, currency, provider, provider_payment_id, created_at
      FROM payments
      WHERE order_id = ?
      ORDER BY created_at DESC
    `).bind(id).all();

    // Get refunds for payments of this order
    const refundsRes = await c.env.DB.prepare(`
      SELECT r.id, r.payment_id, r.status, r.amount, r.currency, r.provider_refund_id, r.reason, r.created_at
      FROM refunds r
      INNER JOIN payments p ON p.id = r.payment_id
      WHERE p.order_id = ?
      ORDER BY r.created_at DESC
    `).bind(id).all();

    // Get stripe_events related to this order (search in payload_json)
    const stripeEventsRes = await c.env.DB.prepare(`
      SELECT id, event_id, event_type, processing_status, error, received_at, processed_at
      FROM stripe_events
      WHERE payload_json LIKE ? OR payload_json LIKE ?
      ORDER BY received_at DESC
      LIMIT 50
    `).bind(`%"orderId":"${id}"%`, `%"order_id":"${id}"%`).all();

    return jsonOk(c, {
      order,
      payments: paymentsRes.results || [],
      refunds: refundsRes.results || [],
      stripeEvents: stripeEventsRes.results || []
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to fetch order details");
  }
});

export default adminOrders;