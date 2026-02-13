import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { newsletterSubscribeSchema } from '../../lib/schemas/newsletter';
import { validationErrorHandler } from '../../lib/validation';

const newsletter = new Hono<Env>();

// POST /store/newsletter/subscribe - Public newsletter subscription
newsletter.post(
  '/newsletter/subscribe',
  zValidator('json', newsletterSubscribeSchema, validationErrorHandler),
  async (c) => {
    const { email } = c.req.valid('json');

    try {
      // Check if already subscribed
      const existing = await c.env.DB.prepare(
        'SELECT id, status FROM newsletter_subscribers WHERE email = ?'
      ).bind(email).first<{ id: number; status: string }>();

      if (existing) {
        if (existing.status === 'active') {
          return jsonOk(c, { message: 'Already subscribed' });
        }
        // Re-activate if previously unsubscribed
        await c.env.DB.prepare(
          "UPDATE newsletter_subscribers SET status = 'active', updated_at = datetime('now') WHERE id = ?"
        ).bind(existing.id).run();
        return jsonOk(c, { message: 'Subscription reactivated' });
      }

      // Insert new subscriber
      await c.env.DB.prepare(
        "INSERT INTO newsletter_subscribers (email, status, created_at, updated_at) VALUES (?, 'active', datetime('now'), datetime('now'))"
      ).bind(email).run();

      return jsonOk(c, { message: 'Subscribed successfully' });
    } catch (err) {
      console.error('Failed to subscribe to newsletter:', err);
      return jsonError(c, 'Failed to subscribe', 500);
    }
  }
);

export default newsletter;
