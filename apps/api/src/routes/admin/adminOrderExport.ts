import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonError } from '../../lib/http';
import { validationErrorHandler } from '../../lib/validation';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';
import { createLogger } from '../../lib/logger';

const logger = createLogger('admin-order-export');
const adminOrderExport = new Hono<Env>();

adminOrderExport.use('*', loadRbac);

const exportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  format: z.enum(['csv']).optional().default('csv'),
});

type OrderExportRow = {
  order_id: number;
  date: string;
  customer_email: string | null;
  product_title: string | null;
  variant_title: string | null;
  quantity: number;
  amount: number;
  status: string;
};

const escapeCSVField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const buildCSV = (rows: readonly OrderExportRow[]): string => {
  const header = 'order_id,date,customer_email,product_name,quantity,amount,status';
  const lines = rows.map((row) => {
    const productName = [row.product_title, row.variant_title]
      .filter(Boolean)
      .join(' - ');
    return [
      String(row.order_id),
      escapeCSVField(row.date || ''),
      escapeCSVField(row.customer_email || ''),
      escapeCSVField(productName),
      String(row.quantity),
      String(row.amount),
      escapeCSVField(row.status),
    ].join(',');
  });
  return [header, ...lines].join('\n');
};

// GET /admin/orders/export
adminOrderExport.get(
  '/orders/export',
  requirePermission(PERMISSIONS.ORDERS_READ),
  zValidator('query', exportQuerySchema, validationErrorHandler),
  async (c) => {
    const { from, to } = c.req.valid('query');

    if (from > to) {
      return jsonError(c, '"from" date must be before or equal to "to" date', 400);
    }

    try {
      const res = await c.env.DB.prepare(`
        SELECT
          o.id as order_id,
          o.created_at as date,
          c.email as customer_email,
          p.title as product_title,
          v.title as variant_title,
          oi.quantity,
          oi.unit_price as amount,
          o.status
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN variants v ON v.id = oi.variant_id
        LEFT JOIN products p ON p.id = v.product_id
        WHERE date(o.created_at) >= ? AND date(o.created_at) <= ?
        ORDER BY o.created_at ASC, o.id ASC
      `).bind(from, to).all<OrderExportRow>();

      const rows = res.results || [];
      const csv = buildCSV(rows);

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="orders_${from}_${to}.csv"`,
        },
      });
    } catch (err) {
      logger.error('Failed to export orders', { error: String(err) });
      return jsonError(c, 'Failed to export orders');
    }
  }
);

export default adminOrderExport;
