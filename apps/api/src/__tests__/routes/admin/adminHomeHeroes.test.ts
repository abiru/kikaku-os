import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminHomeHeroes from '../../../routes/admin/adminHomeHeroes';

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  heroes?: any[];
  hero?: any | null;
  insertResult?: { meta: { last_row_id: number } };
  countResult?: { count: number };
  checkHero?: any | null; // For SELECT id checks
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM home_hero_sections')) {
            return { results: options.heroes || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return options.countResult || { count: 0 };
          }
          if (sql.includes('SELECT id') && options.checkHero !== undefined) {
            return options.checkHero;
          }
          if (sql.includes('FROM home_hero_sections')) {
            return options.hero || null;
          }
          return null;
        }),
        run: vi.fn(async () => options.insertResult || { meta: { last_row_id: 1 } })
      }))
    }))
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminHomeHeroes);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any)
  };
};

describe('Admin Home Heroes API', () => {
  describe('GET /admin/home/heroes', () => {
    it('returns list of hero sections with pagination', async () => {
      const heroes = [
        {
          id: 1,
          title: 'Hero 1',
          subtitle: 'Subtitle 1',
          image_r2_key: 'images/hero1.jpg',
          image_r2_key_small: null,
          cta_primary_text: 'Shop Now',
          cta_primary_url: '/products',
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 1,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        },
        {
          id: 2,
          title: 'Hero 2',
          subtitle: null,
          image_r2_key: null,
          image_r2_key_small: null,
          cta_primary_text: null,
          cta_primary_url: null,
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 2,
          status: 'draft',
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z'
        }
      ];

      const db = createMockDb({ heroes, countResult: { count: 2 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes', {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.heroes).toHaveLength(2);
      expect(json.heroes[0].id).toBe(1);
      expect(json.heroes[0].title).toBe('Hero 1');
      expect(json.meta).toEqual({
        page: 1,
        perPage: 20,
        totalCount: 2,
        totalPages: 1
      });
    });

    it('filters by status', async () => {
      const activeHeroes = [
        {
          id: 1,
          title: 'Active Hero',
          status: 'active',
          position: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      ];

      const db = createMockDb({ heroes: activeHeroes, countResult: { count: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes?status=active', {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.heroes).toHaveLength(1);
    });

    it('supports pagination parameters', async () => {
      const db = createMockDb({ heroes: [], countResult: { count: 50 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes?page=2&perPage=10', {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalPages).toBe(5);
    });
  });

  describe('GET /admin/home/heroes/:id', () => {
    it('returns a single hero section', async () => {
      const hero = {
        id: 1,
        title: 'Test Hero',
        subtitle: 'Test Subtitle',
        image_r2_key: 'test.jpg',
        image_r2_key_small: 'test-small.jpg',
        cta_primary_text: 'Click Me',
        cta_primary_url: '/test',
        cta_secondary_text: null,
        cta_secondary_url: null,
        position: 1,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      const db = createMockDb({ hero });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1', {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.hero.id).toBe(1);
      expect(json.hero.title).toBe('Test Hero');
    });

    it('returns 404 for non-existent hero', async () => {
      const db = createMockDb({ hero: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/999', {
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });
  });

  describe('POST /admin/home/heroes', () => {
    it('creates a new hero section', async () => {
      const db = createMockDb({ insertResult: { meta: { last_row_id: 123 } } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'New Hero',
          subtitle: 'New Subtitle',
          image_r2_key: 'new.jpg',
          cta_primary_text: 'Shop',
          cta_primary_url: '/shop',
          position: 1,
          status: 'active'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.id).toBe(123);
      expect(json.message).toContain('created');
    });

    it('creates hero with minimal required fields', async () => {
      const db = createMockDb({ insertResult: { meta: { last_row_id: 1 } } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Minimal Hero'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 400 for missing title', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subtitle: 'No title'
        })
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/home/heroes/:id', () => {
    it('updates an existing hero section', async () => {
      const db = createMockDb({ hero: { id: 1 }, checkHero: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Updated Hero',
          subtitle: 'Updated Subtitle'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toContain('updated');
    });

    it('returns 404 for non-existent hero', async () => {
      const db = createMockDb({ hero: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Updated'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('handles all field updates', async () => {
      const db = createMockDb({ hero: { id: 1 }, checkHero: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Updated',
          subtitle: 'Updated Sub',
          image_r2_key: 'new.jpg',
          image_r2_key_small: 'new-small.jpg',
          cta_primary_text: 'New CTA',
          cta_primary_url: '/new',
          cta_secondary_text: 'Secondary',
          cta_secondary_url: '/secondary'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('updates position and status', async () => {
      const db = createMockDb({ hero: { id: 1 }, checkHero: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          position: 5,
          status: 'draft'
        })
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });
  });

  describe('DELETE /admin/home/heroes/:id', () => {
    it('archives a hero section', async () => {
      const db = createMockDb({
        hero: { id: 1, status: 'active' },
        checkHero: { id: 1, status: 'active' }
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toContain('archived');
    });

    it('returns 404 for non-existent hero', async () => {
      const db = createMockDb({ hero: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  describe('POST /admin/home/heroes/:id/restore', () => {
    it('restores an archived hero section', async () => {
      const db = createMockDb({
        hero: { id: 1, status: 'archived' },
        checkHero: { id: 1, status: 'archived' }
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/1/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toContain('restored');
    });

    it('returns 404 for non-existent hero', async () => {
      const db = createMockDb({ hero: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/999/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('restores archived hero to draft status', async () => {
      const db = createMockDb({
        hero: { id: 2, status: 'archived' },
        checkHero: { id: 2, status: 'archived' }
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/home/heroes/2/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY }
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });
  });
});
