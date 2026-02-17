import { Hono } from 'hono';
import type { Env } from '../../env';
import { jsonOk } from '../../lib/http';
import type { StaticPageRow } from './storefrontTypes';

const pages = new Hono<Env>();

// GET /pages/:slug - Fetch published static page by slug
pages.get('/pages/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || slug.length < 1 || slug.length > 100) {
    return jsonOk(c, { page: null });
  }

  const page = await c.env.DB.prepare(`
    SELECT id, slug, title, meta_title, meta_description, body, status, updated_at
    FROM static_pages
    WHERE slug = ? AND status = 'published'
  `).bind(slug).first<StaticPageRow>();

  return jsonOk(c, { page: page || null });
});

export default pages;
