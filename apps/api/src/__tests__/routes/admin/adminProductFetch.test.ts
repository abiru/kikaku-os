import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminProductFetch from '../../../routes/admin/adminProductFetch';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

// Mock @cloudflare/playwright to avoid importing the real module
vi.mock('@cloudflare/playwright', () => ({
  launch: vi.fn(),
}));

const createMockDb = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: vi.fn(async () => ({ meta: { last_row_id: 1, changes: 1 } })),
    })),
  })),
});

const createApp = (env: Record<string, unknown> = {}) => {
  const app = new Hono();
  app.route('/admin', adminProductFetch);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: createMockDb(),
        ...env,
      } as any),
  };
};

describe('Admin Product Fetch', () => {
  describe('POST /admin/product-fetch', () => {
    it('returns 501 when BROWSER binding is not configured', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/product' }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(501);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Browser Rendering is not configured');
    });

    it('returns 400 for invalid URL format', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-url' }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('returns 400 for missing url field', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('blocks localhost URL (SSRF prevention)', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:8787/admin' }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('unsafe URL');
    });

    it('blocks 127.0.0.1 URL (SSRF prevention)', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:8787/secret' }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('unsafe URL');
    });

    it('blocks private IP ranges (SSRF prevention)', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const privateUrls = [
        'http://10.0.0.1/internal',
        'http://192.168.1.1/admin',
        'http://172.16.0.1/secret',
      ];

      for (const url of privateUrls) {
        const res = await fetch('/admin/product-fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        const json = (await res.json()) as any;
        expect(res.status).toBe(400);
        expect(json.message).toContain('unsafe URL');
      }
    });

    it('blocks cloud metadata endpoints (SSRF prevention)', async () => {
      const { fetch } = createApp({ BROWSER: {} });

      const res = await fetch('/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('unsafe URL');
    });
  });
});
