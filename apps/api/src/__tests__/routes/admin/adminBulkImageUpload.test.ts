import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminBulkImageUpload from '../../../routes/admin/adminBulkImageUpload';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/bulkImageUpload', () => ({
  parseCSV: vi.fn(),
  parseJSON: vi.fn(),
}));

import { parseCSV, parseJSON } from '../../../services/bulkImageUpload';

const createMockDb = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: vi.fn(async () => ({
        meta: { last_row_id: 42, changes: 1 },
      })),
    })),
  })),
});

const createApp = (db: ReturnType<typeof createMockDb> = createMockDb()) => {
  const app = new Hono();
  app.route('/admin/bulk-image-upload', adminBulkImageUpload);
  return {
    app,
    db,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('Admin Bulk Image Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /admin/bulk-image-upload/parse', () => {
    it('parses CSV file successfully', async () => {
      const mockResult = {
        mappings: [
          { product_id: 1, product_title: 'Product A', image_urls: ['https://example.com/img.jpg'], existing_r2_images: 0 },
        ],
        errors: [],
        summary: { total_products: 1, total_images: 1, skipped: 0 },
      };
      (parseCSV as any).mockResolvedValueOnce(mockResult);

      const { fetch } = createApp();

      const formData = new FormData();
      formData.append('file', new File(['product_id,image_url\n1,https://example.com/img.jpg'], 'upload.csv', { type: 'text/csv' }));

      const res = await fetch('/admin/bulk-image-upload/parse', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.mappings).toHaveLength(1);
      expect(json.summary.total_products).toBe(1);
      expect(parseCSV).toHaveBeenCalledTimes(1);
    });

    it('parses JSON file successfully', async () => {
      const mockResult = {
        mappings: [
          { product_id: 2, product_title: 'Product B', image_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], existing_r2_images: 1 },
        ],
        errors: [],
        summary: { total_products: 1, total_images: 2, skipped: 0 },
      };
      (parseJSON as any).mockResolvedValueOnce(mockResult);

      const { fetch } = createApp();

      const formData = new FormData();
      formData.append('file', new File(['[{"product_id":2,"image_urls":["https://example.com/a.jpg"]}]'], 'upload.json', { type: 'application/json' }));

      const res = await fetch('/admin/bulk-image-upload/parse', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(parseJSON).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when Content-Type is not multipart/form-data', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/bulk-image-upload/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('multipart/form-data');
    });

    it('returns 400 when no file is provided', async () => {
      const { fetch } = createApp();

      const formData = new FormData();
      // No file appended

      const res = await fetch('/admin/bulk-image-upload/parse', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('No file provided');
    });

    it('returns 400 for unsupported file extension', async () => {
      const { fetch } = createApp();

      const formData = new FormData();
      formData.append('file', new File(['data'], 'upload.txt', { type: 'text/plain' }));

      const res = await fetch('/admin/bulk-image-upload/parse', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('.csv or .json');
    });
  });

  describe('POST /admin/bulk-image-upload/execute', () => {
    it('creates inbox item from mappings', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/bulk-image-upload/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [
            { product_id: 1, product_title: 'Product A', image_urls: ['https://example.com/img.jpg'], existing_r2_images: 0 },
          ],
          batch_name: 'Test Batch',
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inbox_id).toBe(42);
      expect(json.message).toContain('1 products');
      expect(json.message).toContain('1 images');
    });

    it('returns 400 when mappings is empty', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/bulk-image-upload/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: [] }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('No mappings provided');
    });

    it('returns 400 when mappings is missing', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/bulk-image-upload/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('No mappings provided');
    });

    it('uses default batch name when not provided', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/admin/bulk-image-upload/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [
            { product_id: 1, product_title: 'P1', image_urls: ['https://example.com/a.jpg'], existing_r2_images: 0 },
          ],
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('counts total images across multiple mappings', async () => {
      const { fetch } = createApp();

      const res = await fetch('/admin/bulk-image-upload/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: [
            { product_id: 1, product_title: 'P1', image_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], existing_r2_images: 0 },
            { product_id: 2, product_title: 'P2', image_urls: ['https://example.com/c.jpg'], existing_r2_images: 1 },
          ],
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toContain('2 products');
      expect(json.message).toContain('3 images');
    });
  });
});
