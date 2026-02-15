import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { reviewListQuerySchema, reviewIdParamSchema } from '../../lib/schemas/review';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';
import { validationErrorHandler } from '../../lib/validation';

const adminReviews = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
adminReviews.use('*', loadRbac);

type ReviewRow = {
  id: number;
  product_id: number;
  product_title: string | null;
  customer_email: string;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// GET /admin/reviews - List reviews with optional status filter
adminReviews.get(
  '/reviews',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('query', reviewListQuerySchema, validationErrorHandler),
  async (c) => {
    const { status, limit, offset } = c.req.valid('query');

    try {
      const where = status !== 'all' ? 'WHERE r.status = ?' : '';
      const params: unknown[] = status !== 'all' ? [status] : [];

      const countSql = `SELECT COUNT(*) as total FROM reviews r ${where}`;
      const countResult = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();

      const sql = `
        SELECT r.id, r.product_id, p.title as product_title,
               r.customer_email, r.customer_name, r.rating,
               r.title, r.body, r.status, r.created_at, r.updated_at
        FROM reviews r
        LEFT JOIN products p ON r.product_id = p.id
        ${where}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const result = await c.env.DB.prepare(sql).bind(...params, limit, offset).all<ReviewRow>();

      return jsonOk(c, {
        reviews: result.results || [],
        total: countResult?.total || 0,
      });
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
      return jsonError(c, 'Failed to fetch reviews', 500);
    }
  }
);

// POST /admin/reviews/:id/approve - Approve a review
adminReviews.post(
  '/reviews/:id/approve',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', reviewIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const review = await c.env.DB.prepare('SELECT id, status FROM reviews WHERE id = ?')
        .bind(id).first<{ id: number; status: string }>();

      if (!review) {
        return jsonError(c, 'Review not found', 404);
      }

      if (review.status === 'approved') {
        return jsonOk(c, { message: 'Review already approved' });
      }

      await c.env.DB.prepare(`
        UPDATE reviews SET status = 'approved', updated_at = datetime('now') WHERE id = ?
      `).bind(id).run();

      return jsonOk(c, { message: 'Review approved' });
    } catch (err) {
      console.error('Failed to approve review:', err);
      return jsonError(c, 'Failed to approve review', 500);
    }
  }
);

// POST /admin/reviews/:id/reject - Reject a review
adminReviews.post(
  '/reviews/:id/reject',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', reviewIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const review = await c.env.DB.prepare('SELECT id, status FROM reviews WHERE id = ?')
        .bind(id).first<{ id: number; status: string }>();

      if (!review) {
        return jsonError(c, 'Review not found', 404);
      }

      if (review.status === 'rejected') {
        return jsonOk(c, { message: 'Review already rejected' });
      }

      await c.env.DB.prepare(`
        UPDATE reviews SET status = 'rejected', updated_at = datetime('now') WHERE id = ?
      `).bind(id).run();

      return jsonOk(c, { message: 'Review rejected' });
    } catch (err) {
      console.error('Failed to reject review:', err);
      return jsonError(c, 'Failed to reject review', 500);
    }
  }
);

export default adminReviews;
