import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCSV, parseJSON } from '../../services/bulkImageUpload';

vi.mock('../../lib/r2', () => ({
  putImage: vi.fn(),
  deleteKey: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

const createMockDb = (products: Record<number, string> = { 1: 'Product A', 2: 'Product B' }) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          const productId = args[0] as number;
          if (sql.includes('SELECT id, title FROM products')) {
            const title = products[productId];
            return title ? { id: productId, title } : null;
          }
          if (sql.includes('COUNT(*)')) {
            return { count: 0 };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ meta: { last_row_id: 1, changes: 1 } })),
      })),
    })),
  } as unknown as D1Database;
};

describe('bulkImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCSV', () => {
    it('parses valid CSV content', async () => {
      const csv = 'product_id,image_url\n1,https://example.com/img1.jpg\n1,https://example.com/img2.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.mappings).toHaveLength(1);
      expect(result.mappings[0]!.product_id).toBe(1);
      expect(result.mappings[0]!.image_urls).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.total_products).toBe(1);
      expect(result.summary.total_images).toBe(2);
    });

    it('returns error for empty file', async () => {
      const db = createMockDb();
      const result = await parseCSV('', db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toBe('Empty file');
    });

    it('skips invalid product IDs', async () => {
      const csv = 'product_id,image_url\nabc,https://example.com/img.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid product ID');
    });

    it('skips invalid URLs', async () => {
      const csv = 'product_id,image_url\n1,not-a-url';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid URL');
    });

    it('rejects URLs with blocked hostnames', async () => {
      const csv = 'product_id,image_url\n1,http://localhost/img.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid URL');
    });

    it('rejects URLs with private IP ranges', async () => {
      const csv = 'product_id,image_url\n1,http://192.168.1.1/img.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid URL');
    });

    it('reports error when product not found in DB', async () => {
      const csv = 'product_id,image_url\n999,https://example.com/img.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors.some(e => e.error.includes('not found'))).toBe(true);
    });

    it('handles rows with insufficient columns', async () => {
      const csv = 'product_id,image_url\n1';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('Invalid CSV format');
    });

    it('groups multiple images for the same product', async () => {
      const csv = 'product_id,image_url\n1,https://example.com/a.jpg\n1,https://example.com/b.jpg\n2,https://example.com/c.jpg';
      const db = createMockDb();
      const result = await parseCSV(csv, db);

      expect(result.mappings).toHaveLength(2);
      const product1 = result.mappings.find(m => m.product_id === 1);
      expect(product1?.image_urls).toHaveLength(2);
      expect(result.summary.total_images).toBe(3);
    });
  });

  describe('parseJSON', () => {
    it('parses valid JSON array', async () => {
      const json = JSON.stringify([
        { product_id: 1, image_urls: ['https://example.com/a.jpg'] },
      ]);
      const db = createMockDb();
      const result = await parseJSON(json, db);

      expect(result.mappings).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid JSON', async () => {
      const db = createMockDb();
      const result = await parseJSON('not json', db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors[0]!.error).toBe('Invalid JSON format');
    });

    it('returns error when JSON is not an array', async () => {
      const db = createMockDb();
      const result = await parseJSON('{"product_id": 1}', db);

      expect(result.errors[0]!.error).toBe('JSON must be an array of entries');
    });

    it('skips entries without product_id', async () => {
      const json = JSON.stringify([{ image_urls: ['https://example.com/a.jpg'] }]);
      const db = createMockDb();
      const result = await parseJSON(json, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('skips entries without image_urls array', async () => {
      const json = JSON.stringify([{ product_id: 1 }]);
      const db = createMockDb();
      const result = await parseJSON(json, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('validates URLs in image_urls', async () => {
      const json = JSON.stringify([
        { product_id: 1, image_urls: ['not-a-url'] },
      ]);
      const db = createMockDb();
      const result = await parseJSON(json, db);

      expect(result.mappings).toHaveLength(0);
      expect(result.errors[0]!.error).toContain('Invalid URLs');
    });

    it('reports error when product not found', async () => {
      const json = JSON.stringify([
        { product_id: 999, image_urls: ['https://example.com/a.jpg'] },
      ]);
      const db = createMockDb();
      const result = await parseJSON(json, db);

      expect(result.errors.some(e => e.error.includes('not found'))).toBe(true);
    });
  });
});
