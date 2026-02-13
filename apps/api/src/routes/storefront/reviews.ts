import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { reviewSubmitSchema, reviewProductIdParamSchema } from '../../lib/schemas/review';
import { validationErrorHandler } from '../../lib/validation';

const reviews = new Hono<Env>();

// GET /store/products/:id/reviews - Public: get approved reviews for a product
reviews.get(
  '/products/:id/reviews',
  zValidator('param', reviewProductIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id: productId } = c.req.valid('param');

    try {
      const reviewRows = await c.env.DB.prepare(`
        SELECT id, customer_name, rating, title, body, created_at
        FROM reviews
        WHERE product_id = ? AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 100
      `).bind(productId).all();

      const avgResult = await c.env.DB.prepare(`
        SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
        FROM reviews
        WHERE product_id = ? AND status = 'approved'
      `).bind(productId).first<{ avg_rating: number | null; review_count: number }>();

      return jsonOk(c, {
        reviews: reviewRows.results || [],
        averageRating: avgResult?.avg_rating ? Math.round(avgResult.avg_rating * 10) / 10 : null,
        reviewCount: avgResult?.review_count || 0,
      });
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
      return jsonError(c, 'Failed to fetch reviews', 500);
    }
  }
);

// POST /store/products/:id/reviews - Public: submit a review
reviews.post(
  '/products/:id/reviews',
  zValidator('param', reviewProductIdParamSchema, validationErrorHandler),
  zValidator('json', reviewSubmitSchema, validationErrorHandler),
  async (c) => {
    const { id: productId } = c.req.valid('param');
    const { name, email, rating, title, body } = c.req.valid('json');

    try {
      // Verify product exists
      const product = await c.env.DB.prepare(
        'SELECT id, title FROM products WHERE id = ?'
      ).bind(productId).first<{ id: number; title: string }>();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Insert review with pending status
      const result = await c.env.DB.prepare(`
        INSERT INTO reviews (product_id, customer_email, customer_name, rating, title, body, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(productId, email, name, rating, title, body).run();

      const reviewId = result.meta.last_row_id;

      // Create inbox item for admin review (Inbox pattern)
      await c.env.DB.prepare(`
        INSERT INTO inbox_items (title, body, severity, status, kind, metadata, created_at, updated_at)
        VALUES (?, ?, 'info', 'open', 'product_review', ?, datetime('now'), datetime('now'))
      `).bind(
        `新しいレビュー: ${product.title} (${rating}つ星)`,
        `${name} (${email}) からのレビュー:\n\nタイトル: ${title}\n\n${body}`,
        JSON.stringify({ review_id: reviewId, product_id: productId, rating, customer_name: name })
      ).run();

      return jsonOk(c, { id: reviewId });
    } catch (err) {
      console.error('Failed to submit review:', err);
      return jsonError(c, 'Failed to submit review', 500);
    }
  }
);

export default reviews;
