import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { clerkAuth } from '../../middleware/clerkAuth';

const account = new Hono<Env>();

// All routes require Clerk authentication
account.use('/*', clerkAuth);

// Schema for payment ID parameter
const paymentIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number)
});

// Schema for pagination query
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(10)
});

type PaymentRow = {
  id: number;
  order_id: number;
  status: string;
  amount: number;
  currency: string;
  method: string | null;
  provider_payment_id: string | null;
  created_at: string;
  order_status: string;
  order_total: number;
  order_paid_at: string | null;
};

type PaymentDetailRow = PaymentRow & {
  order_metadata: string | null;
  order_subtotal: number;
  order_tax_amount: number;
  order_shipping_fee: number;
  order_discount: number;
};

type OrderItemRow = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

// GET /account/payments - List customer's payment history
account.get(
  '/payments',
  zValidator('query', paginationQuerySchema),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const { page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      // Find customer by clerk_user_id or email
      const customer = await c.env.DB.prepare(`
        SELECT id FROM customers
        WHERE clerk_user_id = ? OR (clerk_user_id IS NULL AND email = ?)
      `).bind(authUser.userId, authUser.email || '').first<{ id: number }>();

      if (!customer) {
        return jsonOk(c, {
          payments: [],
          meta: { page, perPage, totalCount: 0, totalPages: 0 }
        });
      }

      // Count total payments
      const countRes = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM payments p
        INNER JOIN orders o ON o.id = p.order_id
        WHERE o.customer_id = ?
      `).bind(customer.id).first<{ count: number }>();

      const totalCount = countRes?.count || 0;

      // Get paginated payments
      const paymentsRes = await c.env.DB.prepare(`
        SELECT
          p.id,
          p.order_id,
          p.status,
          p.amount,
          p.currency,
          p.method,
          p.provider_payment_id,
          p.created_at,
          o.status as order_status,
          o.total_net as order_total,
          o.paid_at as order_paid_at
        FROM payments p
        INNER JOIN orders o ON o.id = p.order_id
        WHERE o.customer_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(customer.id, perPage, offset).all<PaymentRow>();

      return jsonOk(c, {
        payments: paymentsRes.results || [],
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (err) {
      console.error('Failed to fetch payment history:', err);
      return jsonError(c, 'Failed to fetch payment history', 500);
    }
  }
);

// GET /account/payments/:id - Get payment detail
account.get(
  '/payments/:id',
  zValidator('param', paymentIdParamSchema),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const { id } = c.req.valid('param');

    try {
      // Find customer by clerk_user_id or email
      const customer = await c.env.DB.prepare(`
        SELECT id FROM customers
        WHERE clerk_user_id = ? OR (clerk_user_id IS NULL AND email = ?)
      `).bind(authUser.userId, authUser.email || '').first<{ id: number }>();

      if (!customer) {
        return jsonError(c, 'Payment not found', 404);
      }

      // Get payment with order details (verify customer ownership)
      const payment = await c.env.DB.prepare(`
        SELECT
          p.id,
          p.order_id,
          p.status,
          p.amount,
          p.currency,
          p.method,
          p.provider_payment_id,
          p.created_at,
          o.status as order_status,
          o.total_net as order_total,
          o.paid_at as order_paid_at,
          o.metadata as order_metadata,
          o.subtotal as order_subtotal,
          o.tax_amount as order_tax_amount,
          o.shipping_fee as order_shipping_fee,
          o.total_discount as order_discount
        FROM payments p
        INNER JOIN orders o ON o.id = p.order_id
        WHERE p.id = ? AND o.customer_id = ?
      `).bind(id, customer.id).first<PaymentDetailRow>();

      if (!payment) {
        return jsonError(c, 'Payment not found', 404);
      }

      // Get order items
      const itemsRes = await c.env.DB.prepare(`
        SELECT
          p.title as product_title,
          v.title as variant_title,
          oi.quantity,
          oi.unit_price
        FROM order_items oi
        LEFT JOIN variants v ON v.id = oi.variant_id
        LEFT JOIN products p ON p.id = v.product_id
        WHERE oi.order_id = ?
      `).bind(payment.order_id).all<OrderItemRow>();

      // Parse shipping from metadata
      let shipping = null;
      if (payment.order_metadata) {
        try {
          const metadata = JSON.parse(payment.order_metadata);
          shipping = metadata.shipping || null;
        } catch {
          // Ignore parse errors
        }
      }

      // Get bank transfer info if applicable
      let bankTransferInfo = null;
      if (payment.method === 'customer_balance' || payment.method === 'jp_bank_transfer') {
        // Check for bank transfer event
        const bankEvent = await c.env.DB.prepare(`
          SELECT payload FROM events
          WHERE type = 'bank_transfer_requires_action'
            AND json_extract(payload, '$.order_id') = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(payment.order_id).first<{ payload: string }>();

        if (bankEvent?.payload) {
          try {
            const eventData = JSON.parse(bankEvent.payload);
            bankTransferInfo = eventData.next_action?.display_bank_transfer_instructions || null;
          } catch {
            // Ignore parse errors
          }
        }
      }

      return jsonOk(c, {
        payment: {
          id: payment.id,
          order_id: payment.order_id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          created_at: payment.created_at,
          order: {
            status: payment.order_status,
            total: payment.order_total,
            paid_at: payment.order_paid_at,
            subtotal: payment.order_subtotal,
            tax_amount: payment.order_tax_amount,
            shipping_fee: payment.order_shipping_fee,
            discount: payment.order_discount,
            shipping,
            items: (itemsRes.results || []).map(item => ({
              title: item.variant_title !== 'Default'
                ? `${item.product_title} - ${item.variant_title}`
                : item.product_title,
              quantity: item.quantity,
              unit_price: item.unit_price
            }))
          },
          bankTransferInfo
        }
      });
    } catch (err) {
      console.error('Failed to fetch payment detail:', err);
      return jsonError(c, 'Failed to fetch payment detail', 500);
    }
  }
);

// GET /account/orders - List customer's orders (for convenience)
account.get(
  '/orders',
  zValidator('query', paginationQuerySchema),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const { page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      // Find customer by clerk_user_id or email
      const customer = await c.env.DB.prepare(`
        SELECT id FROM customers
        WHERE clerk_user_id = ? OR (clerk_user_id IS NULL AND email = ?)
      `).bind(authUser.userId, authUser.email || '').first<{ id: number }>();

      if (!customer) {
        return jsonOk(c, {
          orders: [],
          meta: { page, perPage, totalCount: 0, totalPages: 0 }
        });
      }

      // Count total orders
      const countRes = await c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM orders WHERE customer_id = ?
      `).bind(customer.id).first<{ count: number }>();

      const totalCount = countRes?.count || 0;

      // Get paginated orders
      const ordersRes = await c.env.DB.prepare(`
        SELECT
          o.id,
          o.status,
          o.total_net,
          o.currency,
          o.created_at,
          o.paid_at,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
        FROM orders o
        WHERE o.customer_id = ?
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(customer.id, perPage, offset).all();

      return jsonOk(c, {
        orders: ordersRes.results || [],
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (err) {
      console.error('Failed to fetch order history:', err);
      return jsonError(c, 'Failed to fetch order history', 500);
    }
  }
);

export default account;
