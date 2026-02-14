import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { validationErrorHandler } from '../../lib/validation';
import { getActor } from '../../middleware/clerkAuth';
import { orderIdParamSchema, orderListQuerySchema, createRefundSchema } from '../../lib/schemas';

const adminOrders = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)

// List Orders
adminOrders.get(
  '/admin/orders',
  zValidator('query', orderListQuerySchema, validationErrorHandler),
  async (c) => {
    const { page, perPage, q } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      let where = 'WHERE 1=1';
      const params: (string | number)[] = [];

      if (q) {
        where += ' AND (c.email LIKE ? OR o.id LIKE ?)';
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
      return jsonError(c, 'Failed to fetch orders');
    }
  }
);

// Ready to Ship (specific route - must come before :id)
adminOrders.get('/admin/orders/ready-to-ship', async (c) => {
  try {
    const res = await c.env.DB.prepare(
      `SELECT o.id as order_id,
              c.email as customer_email,
              o.total_net as total,
              o.paid_at as paid_at,
              f.id as fulfillment_id,
              f.status as fulfillment_status,
              f.tracking_number,
              f.metadata as fulfillment_metadata
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN fulfillments f ON f.order_id = o.id
       WHERE o.status='paid' AND (f.id IS NULL OR f.status='pending')
       ORDER BY o.paid_at ASC, o.id ASC`
    )
      .bind()
      .all<{
        order_id: number;
        customer_email: string | null;
        total: number;
        paid_at: string | null;
        fulfillment_id: number | null;
        fulfillment_status: string | null;
        tracking_number: string | null;
        fulfillment_metadata: string | null;
      }>();

    const orders = (res.results || []).map((row) => {
      let carrier: string | null = null;
      if (row.fulfillment_metadata) {
        try {
          const meta = JSON.parse(row.fulfillment_metadata);
          carrier = meta.carrier || null;
        } catch {
          // ignore
        }
      }
      return {
        order_id: row.order_id,
        customer_email: row.customer_email,
        total: row.total,
        paid_at: row.paid_at,
        fulfillment_id: row.fulfillment_id,
        fulfillment_status: row.fulfillment_status,
        tracking_number: row.tracking_number,
        carrier,
      };
    });

    return jsonOk(c, { orders });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch ready-to-ship orders');
  }
});

// Order Detail
adminOrders.get(
  '/admin/orders/:id',
  zValidator('param', orderIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

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
        return jsonError(c, 'Order not found', 404);
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

      // Get fulfillments for this order
      const fulfillmentsRes = await c.env.DB.prepare(`
        SELECT id, status, tracking_number, created_at, updated_at
        FROM fulfillments
        WHERE order_id = ?
        ORDER BY created_at DESC
      `).bind(id).all();

      return jsonOk(c, {
        order,
        payments: paymentsRes.results || [],
        refunds: refundsRes.results || [],
        stripeEvents: stripeEventsRes.results || [],
        fulfillments: fulfillmentsRes.results || []
      });
    } catch (err) {
      console.error(err);
      return jsonError(c, 'Failed to fetch order details');
    }
  }
);

// Create Refund for Order
adminOrders.post(
  '/admin/orders/:id/refunds',
  zValidator('param', orderIdParamSchema, validationErrorHandler),
  zValidator('json', createRefundSchema, validationErrorHandler),
  async (c) => {
    const { id: orderId } = c.req.valid('param');
    const { amount, reason } = c.req.valid('json');

    try {
      // Get order
      const order = await c.env.DB.prepare(
        'SELECT id, status, total_net, currency FROM orders WHERE id = ?'
      ).bind(orderId).first<{ id: number; status: string; total_net: number; currency: string }>();

      if (!order) {
        return jsonError(c, 'Order not found', 404);
      }

      if (order.status !== 'paid' && order.status !== 'partially_refunded') {
        return jsonError(c, 'Order is not eligible for refund', 400);
      }

      // Get payment with Stripe payment intent ID
      const payment = await c.env.DB.prepare(
        'SELECT id, provider_payment_id, amount FROM payments WHERE order_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(orderId, 'succeeded').first<{ id: number; provider_payment_id: string | null; amount: number }>();

      if (!payment || !payment.provider_payment_id) {
        return jsonError(c, 'No successful payment found for this order', 400);
      }

      // Calculate already refunded amount
      const refundedRes = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(r.amount), 0) as total_refunded
         FROM refunds r
         WHERE r.payment_id = ? AND r.status IN ('succeeded', 'pending')`
      ).bind(payment.id).first<{ total_refunded: number }>();

      const alreadyRefunded = refundedRes?.total_refunded ?? 0;
      const maxRefundable = payment.amount - alreadyRefunded;

      if (maxRefundable <= 0) {
        return jsonError(c, 'This order has already been fully refunded', 400);
      }

      const refundAmount = amount ?? maxRefundable;

      if (refundAmount > maxRefundable) {
        return jsonError(c, `Refund amount exceeds maximum refundable amount (${maxRefundable} ${order.currency})`, 400);
      }

      // Call Stripe Refunds API
      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return jsonError(c, 'Stripe API key not configured', 500);
      }

      const params = new URLSearchParams();
      params.set('payment_intent', payment.provider_payment_id);
      params.set('amount', String(refundAmount));
      params.set('reason', 'requested_by_customer');
      params.set('metadata[reason]', reason);
      params.set('metadata[order_id]', String(orderId));
      params.set('metadata[actor]', getActor(c));

      const stripeRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${stripeKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const errorBody = await stripeRes.text();
        console.error('Stripe refund failed:', errorBody);
        return jsonError(c, 'Failed to create refund with Stripe', 500);
      }

      const stripeRefund = await stripeRes.json() as { id: string; status: string; amount: number };

      // Insert refund record (webhook will also handle this, but we record immediately for UI feedback)
      await c.env.DB.prepare(
        `INSERT INTO refunds (payment_id, status, amount, currency, reason, provider_refund_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        payment.id,
        stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
        refundAmount,
        order.currency,
        reason,
        stripeRefund.id
      ).run();

      // Update order refund tracking (atomic to prevent race conditions with webhooks)
      const newRefundedTotal = alreadyRefunded + refundAmount;
      const newStatus = newRefundedTotal >= payment.amount ? 'refunded' : 'partially_refunded';

      const updateResult = await c.env.DB.prepare(
        `UPDATE orders
         SET refunded_amount = refunded_amount + ?,
             refund_count = refund_count + 1,
             status = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND (refunded_amount + ?) <= total_net`
      ).bind(refundAmount, newStatus, orderId, refundAmount).run();

      if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
        return jsonError(c, 'Refund rejected: concurrent update detected or amount exceeds order total', 409);
      }

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'create_refund',
        `order:${orderId}`,
        JSON.stringify({ amount: refundAmount, reason, stripe_refund_id: stripeRefund.id })
      ).run();

      return jsonOk(c, {
        refund: {
          id: stripeRefund.id,
          amount: refundAmount,
          status: stripeRefund.status,
          reason,
        },
      });
    } catch (err) {
      console.error('Refund creation error:', err);
      return jsonError(c, 'Failed to create refund');
    }
  }
);

export default adminOrders;
