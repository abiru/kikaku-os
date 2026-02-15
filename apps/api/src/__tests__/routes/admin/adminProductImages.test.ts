import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminProductImages from '../../../routes/admin/adminProductImages';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockPutImage = vi.fn();
const mockDeleteKey = vi.fn();

vi.mock('../../../lib/r2', () => ({
  putImage: (...args: any[]) => mockPutImage(...args),
  deleteKey: (...args: any[]) => mockDeleteKey(...args),
}));

vi.mock('../../../lib/image', () => ({
  getExtensionFromContentType: (type: string) => {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    return map[type] || 'bin';
  },
}));

const ADMIN_KEY = 'test-admin-key';

type MockDbOptions = {
  product?: any | null;
  images?: any[];
  imageCount?: number;
  maxPosition?: number | null;
  image?: any | null;
  existingImageIds?: number[];
  insertId?: number;
  throwError?: boolean;
};

const createMockDb = (options: MockDbOptions) => {
  let insertCallCount = 0;

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          if (sql.includes('FROM product_images') && sql.includes('ORDER BY position')) {
            return { results: options.images || [] };
          }
          if (sql.includes('FROM product_images') && sql.includes('IN')) {
            return {
              results: (options.existingImageIds || []).map((id) => ({ id })),
            };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          if (sql.includes('FROM products WHERE id')) {
            return options.product ?? null;
          }
          if (sql.includes('COUNT(*)') && sql.includes('product_images')) {
            return { count: options.imageCount ?? 0 };
          }
          if (sql.includes('MAX(position)')) {
            return { max_pos: options.maxPosition ?? null };
          }
          if (
            sql.includes('FROM product_images WHERE id = ?') &&
            !sql.includes('AND product_id')
          ) {
            return options.images?.[insertCallCount] || {
              id: options.insertId ?? 1,
              product_id: 1,
              r2_key: 'products/1/test.jpg',
              filename: 'test.jpg',
              content_type: 'image/jpeg',
              size_bytes: 1024,
              position: 0,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            };
          }
          if (sql.includes('FROM product_images') && sql.includes('AND product_id')) {
            return options.image ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => {
          insertCallCount++;
          return { meta: { last_row_id: options.insertId ?? insertCallCount } };
        }),
      })),
    })),
  };
};

const mockR2 = {
  put: vi.fn(async () => ({})),
  get: vi.fn(async () => null),
  delete: vi.fn(async () => {}),
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminProductImages);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        R2: mockR2,
        ADMIN_API_KEY: ADMIN_KEY,
      } as any),
  };
};

describe('Admin Product Images API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/products/:id/images', () => {
    it('returns list of images for a product', async () => {
      const images = [
        {
          id: 1,
          product_id: 1,
          r2_key: 'products/1/img1.jpg',
          filename: 'photo1.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
          position: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          product_id: 1,
          r2_key: 'products/1/img2.png',
          filename: 'photo2.png',
          content_type: 'image/png',
          size_bytes: 4096,
          position: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const db = createMockDb({ product: { id: 1 }, images });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.images).toHaveLength(2);
      expect(json.images[0].filename).toBe('photo1.jpg');
      expect(json.images[1].filename).toBe('photo2.png');
    });

    it('returns empty list when product has no images', async () => {
      const db = createMockDb({ product: { id: 1 }, images: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.images).toHaveLength(0);
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/999/images', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Product not found');
    });

    it('returns 400 for invalid product ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/abc/images', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch images');
    });
  });

  describe('POST /admin/products/:id/images', () => {
    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const formData = new FormData();
      formData.append(
        'file',
        new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      );

      const res = await fetch('/admin/products/999/images', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Product not found');
    });

    it('returns 400 for non-multipart content type', async () => {
      const db = createMockDb({ product: { id: 1 }, imageCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('multipart/form-data');
    });

    it('returns 400 when no files provided', async () => {
      const db = createMockDb({ product: { id: 1 }, imageCount: 0 });
      const { fetch } = createApp(db);

      const formData = new FormData();

      const res = await fetch('/admin/products/1/images', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('No files provided');
    });

    it('returns 400 when max images per product is exceeded', async () => {
      const db = createMockDb({ product: { id: 1 }, imageCount: 10 });
      const { fetch } = createApp(db);

      const formData = new FormData();
      formData.append(
        'file',
        new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      );

      const res = await fetch('/admin/products/1/images', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Maximum');
    });

    it('returns 400 for invalid product ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const formData = new FormData();
      formData.append(
        'file',
        new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      );

      const res = await fetch('/admin/products/0/images', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/products/:id/images/order', () => {
    it('updates image order successfully', async () => {
      const reorderedImages = [
        {
          id: 2,
          product_id: 1,
          r2_key: 'products/1/img2.png',
          filename: 'photo2.png',
          content_type: 'image/png',
          size_bytes: 4096,
          position: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:01Z',
        },
        {
          id: 1,
          product_id: 1,
          r2_key: 'products/1/img1.jpg',
          filename: 'photo1.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
          position: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:01Z',
        },
      ];

      const db = createMockDb({
        product: { id: 1 },
        existingImageIds: [1, 2],
        images: reorderedImages,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds: [2, 1] }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.images).toHaveLength(2);
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/999/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds: [1, 2] }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Product not found');
    });

    it('returns 400 for invalid image IDs', async () => {
      const db = createMockDb({
        product: { id: 1 },
        existingImageIds: [1],
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds: [1, 999] }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid image IDs');
      expect(json.message).toContain('999');
    });

    it('returns 400 for empty imageIds array', async () => {
      const db = createMockDb({ product: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds: [] }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing imageIds field', async () => {
      const db = createMockDb({ product: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/order', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageIds: [1, 2] }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to update image order');
    });
  });

  describe('DELETE /admin/products/:id/images/:imageId', () => {
    it('deletes an image successfully', async () => {
      const image = {
        id: 1,
        r2_key: 'products/1/img1.jpg',
        filename: 'photo1.jpg',
      };

      mockDeleteKey.mockResolvedValueOnce(undefined);

      const db = createMockDb({ image });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe(true);
      expect(mockDeleteKey).toHaveBeenCalledWith(mockR2, 'products/1/img1.jpg');
    });

    it('returns 404 for non-existent image', async () => {
      const db = createMockDb({ image: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Image not found');
    });

    it('returns 400 for invalid image ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/abc', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid product ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/0/images/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1/images/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to delete image');
    });
  });
});
