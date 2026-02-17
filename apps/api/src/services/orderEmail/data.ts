import { Env } from '../../env';
import type { OrderWithCustomer, OrderItem } from './types';

export const getOrderWithCustomer = async (
  env: Env['Bindings'],
  orderId: number
): Promise<OrderWithCustomer | null> => {
  const result = await env.DB.prepare(`
    SELECT
      o.id,
      o.status,
      o.total_net,
      o.currency,
      o.created_at,
      o.customer_id,
      o.metadata,
      c.name as customer_name,
      c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `).bind(orderId).first<OrderWithCustomer>();

  return result || null;
};

export const getOrderItems = async (
  env: Env['Bindings'],
  orderId: number
): Promise<OrderItem[]> => {
  const result = await env.DB.prepare(`
    SELECT
      p.title as product_title,
      v.title as variant_title,
      oi.quantity,
      oi.unit_price
    FROM order_items oi
    LEFT JOIN variants v ON v.id = oi.variant_id
    LEFT JOIN products p ON p.id = v.product_id
    WHERE oi.order_id = ?
  `).bind(orderId).all<OrderItem>();

  return result.results || [];
};
