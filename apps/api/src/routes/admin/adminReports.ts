import { Hono } from 'hono';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { buildJstToday, buildJstWeekStart } from '../../lib/date';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';
import { createLogger } from '../../lib/logger';

const logger = createLogger('admin-reports');
const adminReports = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
adminReports.use('*', loadRbac);

// GET /admin/dashboard - Dashboard KPIs and recent activity
adminReports.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_READ), async (c) => {
  try {
    const today = buildJstToday();
    const weekStart = buildJstWeekStart();

    // Today's orders and revenue
    const todayStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total_net), 0) as revenue
      FROM orders
      WHERE status IN ('paid', 'fulfilled', 'partial_refunded')
        AND substr(created_at, 1, 10) = ?
    `).bind(today).first<{ order_count: number; revenue: number }>();

    // Today's refunds
    const todayRefunds = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as refund_total
      FROM refunds
      WHERE status = 'succeeded'
        AND substr(created_at, 1, 10) = ?
    `).bind(today).first<{ refund_total: number }>();

    // This week's orders and revenue
    const weekStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total_net), 0) as revenue
      FROM orders
      WHERE status IN ('paid', 'fulfilled', 'partial_refunded')
        AND substr(created_at, 1, 10) >= ?
    `).bind(weekStart).first<{ order_count: number; revenue: number }>();

    // This week's refunds
    const weekRefunds = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) as refund_total
      FROM refunds
      WHERE status = 'succeeded'
        AND substr(created_at, 1, 10) >= ?
    `).bind(weekStart).first<{ refund_total: number }>();

    // Pending inbox items
    const pendingInbox = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM inbox_items WHERE status = 'open'
    `).first<{ count: number }>();

    // Unfulfilled orders (paid but no shipped/delivered fulfillment)
    const unfulfilledOrders = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM orders o
      WHERE o.status = 'paid'
        AND NOT EXISTS (
          SELECT 1 FROM fulfillments f
          WHERE f.order_id = o.id AND f.status IN ('shipped', 'delivered')
        )
    `).first<{ count: number }>();

    // Recent orders (5)
    const recentOrders = await c.env.DB.prepare(`
      SELECT o.id, c.email as customer_email, o.total_net, o.currency, o.status, o.created_at
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
      LIMIT 5
    `).all<{
      id: number;
      customer_email: string | null;
      total_net: number;
      currency: string;
      status: string;
      created_at: string;
    }>();

    // Recent inbox items (5)
    const recentInbox = await c.env.DB.prepare(`
      SELECT id, title, severity, kind, created_at
      FROM inbox_items
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT 5
    `).all<{
      id: number;
      title: string;
      severity: string;
      kind: string;
      created_at: string;
    }>();

    return jsonOk(c, {
      today: {
        orders: todayStats?.order_count || 0,
        revenue: todayStats?.revenue || 0,
        refunds: todayRefunds?.refund_total || 0
      },
      week: {
        orders: weekStats?.order_count || 0,
        revenue: weekStats?.revenue || 0,
        refunds: weekRefunds?.refund_total || 0
      },
      pending: {
        inbox: pendingInbox?.count || 0,
        unfulfilled: unfulfilledOrders?.count || 0
      },
      recentOrders: recentOrders.results || [],
      recentInbox: recentInbox.results || []
    });
  } catch (err) {
    logger.error('Failed to fetch dashboard data', { error: String(err) });
    return jsonError(c, 'Failed to fetch dashboard data');
  }
});

// GET /admin/documents/:id/download - Download document from R2
adminReports.get('/documents/:id/download', requirePermission(PERMISSIONS.REPORTS_READ), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return jsonError(c, 'Invalid document ID', 400);
  }

  try {
    const doc = await c.env.DB.prepare(
      'SELECT path, content_type FROM documents WHERE id = ?'
    ).bind(id).first<{ path: string; content_type: string }>();

    if (!doc || !doc.path) {
      return jsonError(c, 'Document not found', 404);
    }

    const object = await c.env.R2.get(doc.path);
    if (!object) {
      return jsonError(c, 'File not found in storage', 404);
    }

    const filename = doc.path.split('/').pop() || 'download';
    return new Response(object.body, {
      headers: {
        'Content-Type': doc.content_type || object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err) {
    logger.error('Failed to download document', { error: String(err) });
    return jsonError(c, 'Failed to download document');
  }
});

// GET /admin/reports - List Daily Close documents
adminReports.get('/reports', requirePermission(PERMISSIONS.REPORTS_READ), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');
  const offset = (page - 1) * perPage;

  try {
    // ref_type='daily_close', content_type='text/html' usually for the report view
    const countQuery = "SELECT COUNT(*) as count FROM documents WHERE ref_type = 'daily_close' AND content_type = 'text/html'";
    const countRes = await c.env.DB.prepare(countQuery).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const query = `
      SELECT id, ref_id as date, path, created_at
      FROM documents
      WHERE ref_type = 'daily_close' AND content_type = 'text/html'
      ORDER BY ref_id DESC
      LIMIT ? OFFSET ?
    `;
    const res = await c.env.DB.prepare(query).bind(perPage, offset).all();

    return jsonOk(c, {
      reports: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    logger.error('Failed to fetch reports', { error: String(err) });
    return jsonError(c, 'Failed to fetch reports');
  }
});

// GET /admin/ledger - List Ledger Entries
adminReports.get('/ledger', requirePermission(PERMISSIONS.LEDGER_READ), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '50');
  const offset = (page - 1) * perPage;

  try {
    const countQuery = "SELECT COUNT(*) as count FROM ledger_entries";
    const countRes = await c.env.DB.prepare(countQuery).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const query = `
      SELECT e.id, e.created_at, e.ref_type, e.ref_id, e.memo,
             e.debit, e.credit, e.currency,
             a.name as account_name
      FROM ledger_entries e
      LEFT JOIN ledger_accounts a ON a.id = e.account_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ? OFFSET ?
    `;
    const res = await c.env.DB.prepare(query).bind(perPage, offset).all();

    return jsonOk(c, {
      entries: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    logger.error('Failed to fetch ledger entries', { error: String(err) });
    return jsonError(c, 'Failed to fetch ledger entries');
  }
});

export default adminReports;
