import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import type { OrderItemRow, OrderRow, FulfillmentRow } from './storefrontTypes';

const orders = new Hono<Env>();

orders.get('/orders/:token', async (c) => {
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

const guestOrderLookupSchema = z.object({
  email: z.string().email('Valid email is required'),
  orderToken: z.string().min(1, 'Order token is required'),
});

orders.post('/orders/guest-lookup', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const parsed = guestOrderLookupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, parsed.error.issues[0]?.message || 'Invalid request', 400);
  }

  const { email, orderToken } = parsed.data;

  // Look up order by public token AND verify email matches customer
  const order = await c.env.DB.prepare(`
    SELECT o.id, o.status, o.subtotal, o.tax_amount, o.total_amount,
           o.shipping_fee, o.total_discount, o.currency,
           o.created_at, o.paid_at, o.metadata, o.public_token,
           c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.public_token = ? AND c.email = ?
  `).bind(orderToken, email).first<OrderRow & { public_token: string | null }>();

  if (!order) {
    return jsonError(c, 'Order not found', 404);
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

export default orders;
