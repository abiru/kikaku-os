import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminInquiries from '../../../routes/admin/adminInquiries';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'mock-msg-id' })),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  inquiries?: any[];
  inquiry?: any | null;
  total?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM contact_inquiries')) {
            return { results: options.inquiries || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return { total: options.total ?? 0 };
          }
          if (sql.includes('FROM contact_inquiries')) {
            return options.inquiry ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminInquiries);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Inquiries API', () => {
  describe('GET /admin/inquiries', () => {
    it('returns list of inquiries with meta', async () => {
      const inquiries = [
        {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
          subject: 'Question',
          body: 'I have a question',
          status: 'open',
          admin_reply: null,
          replied_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Another User',
          email: 'user2@example.com',
          subject: 'Support',
          body: 'Need help',
          status: 'open',
          admin_reply: null,
          replied_at: null,
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ];

      const db = createMockDb({ inquiries, total: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inquiries).toHaveLength(2);
      expect(json.meta.total).toBe(2);
      expect(json.inquiries[0].name).toBe('Test User');
    });

    it('returns empty array when no inquiries exist', async () => {
      const db = createMockDb({ inquiries: [], total: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inquiries).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });

    it('defaults to open status filter', async () => {
      const db = createMockDb({ inquiries: [], total: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('supports pagination with limit and offset', async () => {
      const db = createMockDb({ inquiries: [], total: 50 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries?limit=10&offset=20', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.offset).toBe(20);
    });

    it('returns 400 for invalid status', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries?status=invalid', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/inquiries/:id', () => {
    it('returns a single inquiry', async () => {
      const inquiry = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Question',
        body: 'I have a question',
        status: 'open',
        admin_reply: null,
        replied_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({ inquiry });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inquiry.name).toBe('Test User');
      expect(json.inquiry.subject).toBe('Question');
    });

    it('returns 404 for non-existent inquiry', async () => {
      const db = createMockDb({ inquiry: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/999', {
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

      const res = await fetch('/admin/inquiries/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/inquiries/:id/reply', () => {
    it('replies to an open inquiry', async () => {
      const inquiry = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Question',
        status: 'open',
      };

      const db = createMockDb({ inquiry });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/1/reply', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reply: 'Thank you for your inquiry. Here is the answer.' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.emailSent).toBe(true);
    });

    it('returns 404 for non-existent inquiry', async () => {
      const db = createMockDb({ inquiry: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/999/reply', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reply: 'Response text' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 when reply is empty', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/1/reply', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reply: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when reply field is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/1/reply', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/abc/reply', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reply: 'Test' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/inquiries/:id/close', () => {
    it('closes an inquiry', async () => {
      const inquiry = { id: 1 };
      const db = createMockDb({ inquiry });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/1/close', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 404 for non-existent inquiry', async () => {
      const db = createMockDb({ inquiry: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inquiries/999/close', {
        method: 'POST',
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

      const res = await fetch('/admin/inquiries/abc/close', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });
});
