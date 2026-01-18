import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError, jsonOk } from "../lib/http";

const adminOrders = new Hono<Env>();

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
