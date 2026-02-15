import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import {
  newsletterSubscribeSchema,
  newsletterUnsubscribeQuerySchema,
  newsletterUnsubscribeBodySchema,
} from '../../lib/schemas/newsletter';
import { createLogger } from '../../lib/logger';
import { validationErrorHandler } from '../../lib/validation';
import { verifyEmailToken } from '../../lib/token';

const logger = createLogger('newsletter');
const newsletter = new Hono<Env>();

/**
 * Build a simple HTML confirmation page for unsubscribe.
 * The page contains a form that POSTs the token to perform the actual unsubscribe.
 */
const buildUnsubscribeConfirmationHtml = (token: string): string => `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter Unsubscribe</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    h1 { font-size: 1.25rem; margin-bottom: 1rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    button { background: #dc2626; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Newsletter Unsubscribe</h1>
    <p>Are you sure you want to unsubscribe from our newsletter?</p>
    <form method="POST" action="">
      <input type="hidden" name="token" value="${token}" />
      <button type="submit">Unsubscribe</button>
    </form>
  </div>
</body>
</html>`;

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
      logger.error('Failed to subscribe to newsletter', { error: String(err) });
      return jsonError(c, 'Failed to subscribe', 500);
    }
  }
);

// GET /store/newsletter/unsubscribe?token=xxx - Show confirmation page
// Does NOT perform the unsubscribe (email clients prefetch GET links).
newsletter.get(
  '/newsletter/unsubscribe',
  zValidator('query', newsletterUnsubscribeQuerySchema, validationErrorHandler),
  async (c) => {
    const { token } = c.req.valid('query');
    const secret = c.env.NEWSLETTER_SECRET || c.env.ADMIN_API_KEY;
    if (!secret) {
      return jsonError(c, 'Service misconfigured', 500);
    }

    // Verify the token is valid before showing the confirmation page
    const email = await verifyEmailToken(token, secret);
    if (!email) {
      return jsonError(c, 'Invalid or expired unsubscribe link', 400);
    }

    // Return an HTML confirmation page; the actual unsubscribe happens via POST
    return c.html(buildUnsubscribeConfirmationHtml(token));
  }
);

// POST /store/newsletter/unsubscribe - Actually perform the unsubscribe
newsletter.post(
  '/newsletter/unsubscribe',
  zValidator('form', newsletterUnsubscribeBodySchema, validationErrorHandler),
  async (c) => {
    const { token } = c.req.valid('form');
    const secret = c.env.NEWSLETTER_SECRET || c.env.ADMIN_API_KEY;
    if (!secret) {
      return jsonError(c, 'Service misconfigured', 500);
    }

    try {
      // Verify token and extract email
      const email = await verifyEmailToken(token, secret);
      if (!email) {
        return jsonError(c, 'Invalid or expired unsubscribe link', 400);
      }

      // Check if subscriber exists
      const existing = await c.env.DB.prepare(
        'SELECT id, status FROM newsletter_subscribers WHERE email = ?'
      ).bind(email).first<{ id: number; status: string }>();

      if (!existing) {
        return jsonError(c, 'Email not found in newsletter list', 404);
      }

      if (existing.status === 'unsubscribed') {
        return jsonOk(c, { message: 'Already unsubscribed' });
      }

      // Update status to unsubscribed
      await c.env.DB.prepare(
        "UPDATE newsletter_subscribers SET status = 'unsubscribed', updated_at = datetime('now') WHERE id = ?"
      ).bind(existing.id).run();

      return jsonOk(c, { message: 'Successfully unsubscribed from newsletter' });
    } catch (err) {
      return jsonError(c, 'Failed to unsubscribe', 500);
    }
  }
);

export default newsletter;
