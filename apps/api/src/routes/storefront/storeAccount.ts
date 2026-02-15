import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { clerkAuth } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';
import {
  accountOrdersQuerySchema,
  accountOrderIdParamSchema,
  updateAccountProfileSchema,
} from '../../lib/schemas';

const storeAccount = new Hono<Env>();

// Apply Clerk auth to all routes
storeAccount.use('*', clerkAuth);

// Types for database rows
type CustomerRow = {
  id: number;
  name: string;
  email: string | null;
  metadata: string | null;
  clerk_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: number;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
};

type OrderDetailRow = {
  id: number;
  status: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  shipping_fee: number;
  total_discount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  metadata: string | null;
};

type OrderItemRow = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
};

type CustomerStatsRow = {
  total_orders: number;
  total_spent: number;
};

/**
 * Helper to get or create customer by Clerk user ID
 */
async function getOrCreateCustomerByClerkId(
  db: D1Database,
  clerkUserId: string,
  email?: string
): Promise<CustomerRow | null> {
  // First, try to find existing customer
  const existing = await db
    .prepare('SELECT id, name, email, metadata, clerk_user_id, created_at, updated_at FROM customers WHERE clerk_user_id = ?')
    .bind(clerkUserId)
    .first<CustomerRow>();

  if (existing) {
    return existing;
  }

  // If no customer found by Clerk ID, try to find by email and link
  if (email) {
    const byEmail = await db
      .prepare('SELECT id, name, email, metadata, clerk_user_id, created_at, updated_at FROM customers WHERE email = ? AND clerk_user_id IS NULL')
      .bind(email)
      .first<CustomerRow>();

    if (byEmail) {
      // Link existing customer to Clerk user
      await db
        .prepare('UPDATE customers SET clerk_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(clerkUserId, byEmail.id)
        .run();

      return {
        ...byEmail,
        clerk_user_id: clerkUserId,
      };
    }
  }

  // Create new customer
  const name = email?.split('@')[0] || 'Customer';
  const result = await db
    .prepare(
      'INSERT INTO customers (name, email, clerk_user_id, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\')) RETURNING *'
    )
    .bind(name, email || null, clerkUserId)
    .first<CustomerRow>();

  return result;
}

/**
 * GET /store/account
 * Get authenticated customer's account information
 */
storeAccount.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser || authUser.method !== 'clerk') {
    return jsonError(c, 'Authentication required', 401);
  }

  const customer = await getOrCreateCustomerByClerkId(
    c.env.DB,
    authUser.userId,
    authUser.email
  );

  if (!customer) {
    return jsonError(c, 'Failed to get account', 500);
  }

  // Get stats
  const stats = await c.env.DB
    .prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_spent
      FROM orders
      WHERE customer_id = ? AND status IN ('completed', 'paid')
    `)
    .bind(customer.id)
    .first<CustomerStatsRow>();

  // Parse metadata for shipping address
  let shippingAddress = null;
  if (customer.metadata) {
    try {
      const metadata = JSON.parse(customer.metadata);
      shippingAddress = metadata.shipping_address || null;
    } catch {
      // Ignore parse errors
    }
  }

  return jsonOk(c, {
    account: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      shipping_address: shippingAddress,
      created_at: customer.created_at,
    },
    stats: {
      total_orders: stats?.total_orders || 0,
      total_spent: stats?.total_spent || 0,
    },
  });
});

/**
 * GET /store/account/orders
 * Get authenticated customer's order history
 */
storeAccount.get(
  '/orders',
  zValidator('query', accountOrdersQuerySchema, validationErrorHandler),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser || authUser.method !== 'clerk') {
      return jsonError(c, 'Authentication required', 401);
    }

    const customer = await getOrCreateCustomerByClerkId(
      c.env.DB,
      authUser.userId,
      authUser.email
    );

    if (!customer) {
      return jsonError(c, 'Failed to get account', 500);
    }

    const { page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    // Get total count
    const countResult = await c.env.DB
      .prepare('SELECT COUNT(*) as total FROM orders WHERE customer_id = ?')
      .bind(customer.id)
      .first<{ total: number }>();

    const totalCount = countResult?.total || 0;
    const totalPages = Math.ceil(totalCount / perPage);

    // Get orders
    const ordersResult = await c.env.DB
      .prepare(`
        SELECT id, status, total_amount, currency, created_at, paid_at
        FROM orders
        WHERE customer_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(customer.id, perPage, offset)
      .all<OrderRow>();

    return jsonOk(c, {
      orders: ordersResult.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages,
      },
    });
  }
);

/**
 * GET /store/account/orders/:id
 * Get specific order detail for authenticated customer
 */
storeAccount.get(
  '/orders/:id',
  zValidator('param', accountOrderIdParamSchema, validationErrorHandler),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser || authUser.method !== 'clerk') {
      return jsonError(c, 'Authentication required', 401);
    }

    const customer = await getOrCreateCustomerByClerkId(
      c.env.DB,
      authUser.userId,
      authUser.email
    );

    if (!customer) {
      return jsonError(c, 'Failed to get account', 500);
    }

    const { id } = c.req.valid('param');

    // Get order (verify ownership)
    const order = await c.env.DB
      .prepare(`
        SELECT id, status, total_amount, subtotal, tax_amount,
               shipping_fee, total_discount, currency, created_at, paid_at, metadata
        FROM orders
        WHERE id = ? AND customer_id = ?
      `)
      .bind(id, customer.id)
      .first<OrderDetailRow>();

    if (!order) {
      return jsonError(c, 'Order not found', 404);
    }

    // Get order items
    const itemsResult = await c.env.DB
      .prepare(`
        SELECT p.title as product_title,
               v.title as variant_title,
               oi.quantity,
               oi.unit_price,
               COALESCE(oi.tax_amount, 0) as tax_amount
        FROM order_items oi
        LEFT JOIN variants v ON v.id = oi.variant_id
        LEFT JOIN products p ON p.id = v.product_id
        WHERE oi.order_id = ?
      `)
      .bind(order.id)
      .all<OrderItemRow>();

    // Parse shipping info from metadata
    let shipping = null;
    if (order.metadata) {
      try {
        const metadata = JSON.parse(order.metadata);
        shipping = metadata.shipping || null;
      } catch {
        // Ignore parse errors
      }
    }

    return jsonOk(c, {
      order: {
        id: order.id,
        status: order.status,
        subtotal: order.subtotal,
        tax_amount: order.tax_amount,
        shipping_fee: order.shipping_fee,
        total_discount: order.total_discount,
        total_amount: order.total_amount,
        currency: order.currency,
        created_at: order.created_at,
        paid_at: order.paid_at,
        shipping,
        items: (itemsResult.results || []).map((item) => ({
          title:
            item.variant_title !== 'Default'
              ? `${item.product_title} - ${item.variant_title}`
              : item.product_title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_amount: item.tax_amount,
        })),
      },
    });
  }
);

/**
 * PUT /store/account/profile
 * Update authenticated customer's profile
 */
storeAccount.put(
  '/profile',
  zValidator('json', updateAccountProfileSchema, validationErrorHandler),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser || authUser.method !== 'clerk') {
      return jsonError(c, 'Authentication required', 401);
    }

    const customer = await getOrCreateCustomerByClerkId(
      c.env.DB,
      authUser.userId,
      authUser.email
    );

    if (!customer) {
      return jsonError(c, 'Failed to get account', 500);
    }

    const { name, shipping_address } = c.req.valid('json');

    // Merge shipping_address into existing metadata
    let metadata = {};
    if (customer.metadata) {
      try {
        metadata = JSON.parse(customer.metadata);
      } catch {
        // Start fresh if parse fails
      }
    }

    if (shipping_address !== undefined) {
      metadata = {
        ...metadata,
        shipping_address,
      };
    }

    // Update customer
    await c.env.DB
      .prepare(
        'UPDATE customers SET name = ?, metadata = ?, updated_at = datetime(\'now\') WHERE id = ?'
      )
      .bind(name, JSON.stringify(metadata), customer.id)
      .run();

    return jsonOk(c, {
      profile: {
        id: customer.id,
        name,
        email: customer.email,
        shipping_address: shipping_address ?? (metadata as { shipping_address?: unknown }).shipping_address ?? null,
      },
    });
  }
);

export default storeAccount;
