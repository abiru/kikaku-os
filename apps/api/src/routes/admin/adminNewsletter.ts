import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { newsletterListQuerySchema } from '../../lib/schemas/newsletter';
import { validationErrorHandler } from '../../lib/validation';

const adminNewsletter = new Hono<Env>();

type SubscriberRow = {
  id: number;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// GET /admin/newsletter/subscribers - List newsletter subscribers
adminNewsletter.get(
  '/subscribers',
  zValidator('query', newsletterListQuerySchema, validationErrorHandler),
  async (c) => {
    const { status, limit, offset } = c.req.valid('query');

    try {
      const whereClause = status === 'all' ? '' : ' WHERE status = ?';
      const bindValues = status === 'all' ? [] : [status];

      const countResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as total FROM newsletter_subscribers${whereClause}`
      ).bind(...bindValues).first<{ total: number }>();

      const result = await c.env.DB.prepare(
        `SELECT * FROM newsletter_subscribers${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(...bindValues, limit, offset).all<SubscriberRow>();

      return jsonOk(c, {
        subscribers: result.results || [],
        total: countResult?.total ?? 0,
        limit,
        offset,
      });
    } catch (err) {
      console.error('Failed to list newsletter subscribers:', err);
      return jsonError(c, 'Failed to list subscribers', 500);
    }
  }
);

export default adminNewsletter;
