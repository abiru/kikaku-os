import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';
import {
  pageIdParamSchema,
  pageListQuerySchema,
  createPageSchema,
  updatePageSchema,
} from '../../lib/schemas';

const app = new Hono<Env>();


type PageRow = {
  id: number;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// Core pages that cannot be deleted
const CORE_PAGE_SLUGS = ['terms', 'privacy', 'refund'];

// GET /pages - List pages with pagination, search, and status filter
app.get(
  '/pages',
  zValidator('query', pageListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, status, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];

      if (q) {
        conditions.push('(title LIKE ? OR slug LIKE ?)');
        bindings.push(`%${q}%`, `%${q}%`);
      }

      if (status !== 'all') {
        conditions.push('status = ?');
        bindings.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) as count FROM static_pages ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      bindings.push(perPage, offset);

      const pages = await c.env.DB.prepare(dataQuery).bind(...bindings).all<PageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'view_pages',
        'admin_pages_list',
        JSON.stringify({ q, status, page, perPage, count: pages.results.length })
      ).run();

      return jsonOk(c, {
        pages: pages.results,
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch pages');
    }
  }
);

// GET /pages/:id - Fetch single page
app.get(
  '/pages/:id',
  zValidator('param', pageIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const page = await c.env.DB.prepare(`
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages
        WHERE id = ?
      `).bind(id).first<PageRow>();

      if (!page) {
        return jsonError(c, 'Page not found', 404);
      }

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'view_page', `page:${id}`, JSON.stringify({ page_id: id })).run();

      return jsonOk(c, {
        page,
        isCorePage: CORE_PAGE_SLUGS.includes(page.slug)
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch page');
    }
  }
);

// POST /pages - Create page
app.post(
  '/pages',
  zValidator('json', createPageSchema, validationErrorHandler),
  async (c) => {
    const data = c.req.valid('json');

    try {
      // Check for duplicate slug
      const existing = await c.env.DB.prepare(
        'SELECT id FROM static_pages WHERE slug = ?'
      ).bind(data.slug).first();

      if (existing) {
        return jsonError(c, 'A page with this slug already exists', 400);
      }

      const result = await c.env.DB.prepare(`
        INSERT INTO static_pages (slug, title, meta_title, meta_description, body, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        data.slug,
        data.title,
        data.meta_title || null,
        data.meta_description || null,
        data.body,
        data.status
      ).run();

      const pageId = result.meta.last_row_id;

      const page = await c.env.DB.prepare(`
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages WHERE id = ?
      `).bind(pageId).first<PageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_page', `page:${pageId}`, JSON.stringify({ slug: data.slug })).run();

      return jsonOk(c, { page });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to create page');
    }
  }
);

// PUT /pages/:id - Update page
app.put(
  '/pages/:id',
  zValidator('param', pageIdParamSchema, validationErrorHandler),
  zValidator('json', updatePageSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');

    try {
      const existing = await c.env.DB.prepare(
        'SELECT id, slug FROM static_pages WHERE id = ?'
      ).bind(id).first<{ id: number; slug: string }>();

      if (!existing) {
        return jsonError(c, 'Page not found', 404);
      }

      // Check for duplicate slug if changed
      if (data.slug !== existing.slug) {
        const duplicate = await c.env.DB.prepare(
          'SELECT id FROM static_pages WHERE slug = ? AND id != ?'
        ).bind(data.slug, id).first();

        if (duplicate) {
          return jsonError(c, 'A page with this slug already exists', 400);
        }
      }

      await c.env.DB.prepare(`
        UPDATE static_pages
        SET slug = ?, title = ?, meta_title = ?, meta_description = ?, body = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        data.slug,
        data.title,
        data.meta_title || null,
        data.meta_description || null,
        data.body,
        data.status,
        id
      ).run();

      const page = await c.env.DB.prepare(`
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages WHERE id = ?
      `).bind(id).first<PageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_page', `page:${id}`, JSON.stringify({ slug: data.slug })).run();

      return jsonOk(c, { page });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update page');
    }
  }
);

// POST /pages/:id/publish - Publish page
app.post(
  '/pages/:id/publish',
  zValidator('param', pageIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const page = await c.env.DB.prepare(
        'SELECT id, slug, status FROM static_pages WHERE id = ?'
      ).bind(id).first<{ id: number; slug: string; status: string }>();

      if (!page) {
        return jsonError(c, 'Page not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE static_pages SET status = 'published', updated_at = datetime('now') WHERE id = ?
      `).bind(id).run();

      const updatedPage = await c.env.DB.prepare(`
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages WHERE id = ?
      `).bind(id).first<PageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'publish_page', `page:${id}`, JSON.stringify({ slug: page.slug })).run();

      return jsonOk(c, { page: updatedPage });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to publish page');
    }
  }
);

// POST /pages/:id/unpublish - Unpublish page
app.post(
  '/pages/:id/unpublish',
  zValidator('param', pageIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const page = await c.env.DB.prepare(
        'SELECT id, slug, status FROM static_pages WHERE id = ?'
      ).bind(id).first<{ id: number; slug: string; status: string }>();

      if (!page) {
        return jsonError(c, 'Page not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE static_pages SET status = 'draft', updated_at = datetime('now') WHERE id = ?
      `).bind(id).run();

      const updatedPage = await c.env.DB.prepare(`
        SELECT id, slug, title, meta_title, meta_description, body, status, created_at, updated_at
        FROM static_pages WHERE id = ?
      `).bind(id).first<PageRow>();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'unpublish_page', `page:${id}`, JSON.stringify({ slug: page.slug })).run();

      return jsonOk(c, { page: updatedPage });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to unpublish page');
    }
  }
);

// DELETE /pages/:id - Delete page (core pages cannot be deleted)
app.delete(
  '/pages/:id',
  zValidator('param', pageIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const page = await c.env.DB.prepare(
        'SELECT id, slug FROM static_pages WHERE id = ?'
      ).bind(id).first<{ id: number; slug: string }>();

      if (!page) {
        return jsonError(c, 'Page not found', 404);
      }

      if (CORE_PAGE_SLUGS.includes(page.slug)) {
        return jsonError(c, 'Cannot delete core pages (terms, privacy, refund)', 400);
      }

      await c.env.DB.prepare('DELETE FROM static_pages WHERE id = ?').bind(id).run();

      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'delete_page', `page:${id}`, JSON.stringify({ slug: page.slug })).run();

      return jsonOk(c, { deleted: true });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to delete page');
    }
  }
);

export default app;
