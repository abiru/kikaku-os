import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';
import { ensureDate } from '../lib/date';

const adminAnalytics = new Hono<Env>();

type DailySalesRow = {
  date: string;
  orders: number;
  revenue: number;
};

type AnalyticsResponse = {
  dailySales: DailySalesRow[];
  customerBreakdown: {
    newCustomers: number;
    returningCustomers: number;
  };
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
  };
};

// GET /admin/analytics - Analytics data for charts
adminAnalytics.get('/analytics', async (c) => {
  const fromParam = c.req.query('from');
  const toParam = c.req.query('to');

  if (!fromParam || !toParam) {
    return jsonError(c, 'from and to query parameters are required', 400);
  }

  const from = ensureDate(fromParam);
  const to = ensureDate(toParam);

  if (!from || !to) {
    return jsonError(c, 'Invalid date format. Use YYYY-MM-DD', 400);
  }

  if (from > to) {
    return jsonError(c, 'from date must be before or equal to to date', 400);
  }

  try {
    // Daily sales and orders
    const dailySalesQuery = `
      SELECT
        substr(created_at, 1, 10) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_net), 0) as revenue
      FROM orders
      WHERE status IN ('paid', 'fulfilled', 'partial_refunded')
        AND substr(created_at, 1, 10) BETWEEN ? AND ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
    `;
    const dailySalesResult = await c.env.DB.prepare(dailySalesQuery)
      .bind(from, to)
      .all<DailySalesRow>();

    const dailySales = dailySalesResult.results || [];

    // New customers (first order within the period)
    const newCustomersQuery = `
      SELECT COUNT(DISTINCT o.customer_id) as count
      FROM orders o
      WHERE o.status IN ('paid', 'fulfilled', 'partial_refunded')
        AND substr(o.created_at, 1, 10) BETWEEN ? AND ?
        AND o.customer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.customer_id = o.customer_id
            AND o2.status IN ('paid', 'fulfilled', 'partial_refunded')
            AND o2.created_at < o.created_at
        )
    `;
    const newCustomersResult = await c.env.DB.prepare(newCustomersQuery)
      .bind(from, to)
      .first<{ count: number }>();

    // Returning customers (had orders before the period)
    const returningCustomersQuery = `
      SELECT COUNT(DISTINCT o.customer_id) as count
      FROM orders o
      WHERE o.status IN ('paid', 'fulfilled', 'partial_refunded')
        AND substr(o.created_at, 1, 10) BETWEEN ? AND ?
        AND o.customer_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.customer_id = o.customer_id
            AND o2.status IN ('paid', 'fulfilled', 'partial_refunded')
            AND o2.created_at < o.created_at
        )
    `;
    const returningCustomersResult = await c.env.DB.prepare(returningCustomersQuery)
      .bind(from, to)
      .first<{ count: number }>();

    // Summary calculations
    const totalRevenue = dailySales.reduce((sum, day) => sum + day.revenue, 0);
    const totalOrders = dailySales.reduce((sum, day) => sum + day.orders, 0);
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const response: AnalyticsResponse = {
      dailySales,
      customerBreakdown: {
        newCustomers: newCustomersResult?.count || 0,
        returningCustomers: returningCustomersResult?.count || 0
      },
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue
      }
    };

    return jsonOk(c, response);
  } catch (err) {
    console.error('Analytics query error:', err);
    return jsonError(c, 'Failed to fetch analytics data');
  }
});

export default adminAnalytics;
