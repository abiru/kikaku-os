import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminPages from '../../../routes/admin/adminPages';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

const ADMIN_KEY = 'test-admin-key';

const samplePage = {
  id: 1,
  slug: 'about',
  title: 'About Us',
  meta_title: null,
  meta_description: null,
  body: '<p>About page content</p>',
  status: 'published',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const createMockDb = (options: {
  pages?: any[];
  page?: any | null;
  countResult?: { count: number };
  existingBySlug?: any | null;
  duplicateBySlug?: any | null;
  insertMeta?: { last_row_id: number };
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM static_pages') && !sql.includes('COUNT')) {
            return { results: options.pages || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return options.countResult || { count: 0 };
          }
          if (sql.includes('SELECT id FROM static_pages WHERE slug') && sql.includes('AND id !=')) {
            return options.duplicateBySlug || null;
          }
          if (sql.includes('SELECT id FROM static_pages WHERE slug')) {
            return options.existingBySlug || null;
          }
          if (sql.includes('FROM static_pages')) {
            return options.page ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: options.insertMeta || { last_row_id: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminPages);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Pages API', () => {
  describe('GET /admin/pages', () => {
    it('returns list of pages with pagination', async () => {
      const db = createMockDb({
        pages: [samplePage],
        countResult: { count: 1 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.pages).toHaveLength(1);
      expect(json.pages[0].slug).toBe('about');
      expect(json.meta).toEqual({
        page: 1,
        perPage: 20,
        totalCount: 1,
        totalPages: 1,
      });
    });

    it('returns empty list when no pages exist', async () => {
      const db = createMockDb({ pages: [], countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.pages).toHaveLength(0);
    });
  });

  describe('GET /admin/pages/:id', () => {
    it('returns a single page', async () => {
      const db = createMockDb({ page: samplePage });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.page.slug).toBe('about');
      expect(json.isCorePage).toBe(false);
    });

    it('identifies core pages', async () => {
      const termsPage = { ...samplePage, slug: 'terms' };
      const db = createMockDb({ page: termsPage });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.isCorePage).toBe(true);
    });

    it('returns 404 for non-existent page', async () => {
      const db = createMockDb({ page: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/999', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/pages', () => {
    it('creates a new page', async () => {
      const newPage = { ...samplePage, id: 2, slug: 'new-page' };
      const db = createMockDb({
        existingBySlug: null,
        page: newPage,
        insertMeta: { last_row_id: 2 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'new-page',
          title: 'New Page',
          body: '<p>Content</p>',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.page).toBeDefined();
    });

    it('returns 400 for duplicate slug', async () => {
      const db = createMockDb({
        existingBySlug: { id: 1 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'about',
          title: 'Duplicate',
          body: '<p>Content</p>',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('already exists');
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: '<p>No slug or title</p>',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid slug format', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'Invalid Slug!',
          title: 'Test',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/pages/:id', () => {
    it('updates an existing page', async () => {
      const updatedPage = { ...samplePage, title: 'Updated Title' };
      const db = createMockDb({
        page: samplePage,
        duplicateBySlug: null,
      });
      // Need to handle the sequence: first call finds existing, second returns updated
      let firstCall = true;
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, slug FROM static_pages WHERE id')) {
              return { id: 1, slug: 'about' };
            }
            if (sql.includes('SELECT id FROM static_pages WHERE slug') && sql.includes('AND id !=')) {
              return null; // no duplicate
            }
            if (sql.includes('FROM static_pages WHERE id')) {
              return updatedPage;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'about',
          title: 'Updated Title',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 404 for non-existent page', async () => {
      const db = createMockDb({ page: null });
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'test',
          title: 'Test',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  describe('POST /admin/pages/:id/publish', () => {
    it('publishes a draft page', async () => {
      const publishedPage = { ...samplePage, status: 'published' };
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, slug, status')) {
              return { id: 1, slug: 'about', status: 'draft' };
            }
            if (sql.includes('FROM static_pages WHERE id')) {
              return publishedPage;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1/publish', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.page).toBeDefined();
    });

    it('returns 404 for non-existent page', async () => {
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/999/publish', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  describe('POST /admin/pages/:id/unpublish', () => {
    it('unpublishes a published page', async () => {
      const draftPage = { ...samplePage, status: 'draft' };
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, slug, status')) {
              return { id: 1, slug: 'about', status: 'published' };
            }
            if (sql.includes('FROM static_pages WHERE id')) {
              return draftPage;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1/unpublish', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });
  });

  describe('DELETE /admin/pages/:id', () => {
    it('deletes a non-core page', async () => {
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, slug FROM static_pages')) {
              return { id: 1, slug: 'custom-page' };
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe(true);
    });

    it('returns 400 when trying to delete a core page', async () => {
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, slug FROM static_pages')) {
              return { id: 1, slug: 'terms' };
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('Cannot delete core pages');
    });

    it('returns 404 for non-existent page', async () => {
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/pages/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });
});
