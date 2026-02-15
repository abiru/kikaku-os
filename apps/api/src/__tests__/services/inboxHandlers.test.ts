import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchApproval } from '../../services/inboxHandlers';

vi.mock('../../services/bulkImageUpload', () => ({
  executeBulkImageUpload: vi.fn().mockResolvedValue({ success: 2, failed: 0 })
}));

const createMockCtx = (metadata: Record<string, unknown> = {}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('SELECT metadata FROM products WHERE id')) {
            const productId = Number(args[0]);
            const productMap = db._products as Map<number, { metadata: string | null }>;
            return productMap.get(productId) ?? null;
          }
          if (sql.includes('SELECT generated_content FROM ai_content_drafts WHERE id')) {
            const draftMap = db._drafts as Map<number, { generated_content: string }>;
            return draftMap.get(Number(args[0])) ?? null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { success: true };
        }
      })
    }),
    _products: new Map<number, { metadata: string | null }>(),
    _drafts: new Map<number, { generated_content: string }>()
  };

  const r2 = {} as R2Bucket;

  return {
    ctx: {
      db: db as any,
      r2,
      actor: 'admin@test.com',
      itemId: 1,
      metadata: JSON.stringify(metadata)
    },
    calls,
    db
  };
};

describe('inboxHandlers - dispatchApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when kind is null', async () => {
    const { ctx, calls } = createMockCtx({ some: 'data' });

    await dispatchApproval(ctx, null);

    expect(calls).toHaveLength(0);
  });

  it('returns early when metadata is falsy', async () => {
    const ctx = {
      db: {} as any,
      r2: {} as R2Bucket,
      actor: 'admin',
      itemId: 1,
      metadata: ''
    };

    await dispatchApproval(ctx, 'product_update');

    // No error thrown, no calls made
  });

  it('returns early for unknown kind', async () => {
    const { ctx, calls } = createMockCtx({ some: 'data' });

    await dispatchApproval(ctx, 'unknown_kind');

    expect(calls).toHaveLength(0);
  });

  describe('product_update', () => {
    it('updates product metadata with image_url and specs', async () => {
      const { ctx, calls, db } = createMockCtx({
        product_id: 10,
        image_url: 'https://example.com/img.jpg',
        specs: { weight: '500g' },
        source: 'web_scraper'
      });
      db._products.set(10, { metadata: JSON.stringify({ existing: 'value' }) });

      await dispatchApproval(ctx, 'product_update');

      const metadataUpdate = calls.find(
        (c) => c.sql.includes('UPDATE products SET metadata')
      );
      expect(metadataUpdate).toBeDefined();
      const updatedMeta = JSON.parse(metadataUpdate?.bind[0] as string);
      expect(updatedMeta.image_url).toBe('https://example.com/img.jpg');
      expect(updatedMeta.specs).toEqual({ weight: '500g' });
      expect(updatedMeta.existing).toBe('value');
    });

    it('updates product title when provided', async () => {
      const { ctx, calls, db } = createMockCtx({
        product_id: 11,
        title: 'New Title'
      });
      db._products.set(11, { metadata: null });

      await dispatchApproval(ctx, 'product_update');

      const titleUpdate = calls.find(
        (c) => c.sql.includes('UPDATE products SET title')
      );
      expect(titleUpdate).toBeDefined();
      expect(titleUpdate?.bind[0]).toBe('New Title');
    });

    it('updates product description when provided', async () => {
      const { ctx, calls, db } = createMockCtx({
        product_id: 12,
        description: 'New description text'
      });
      db._products.set(12, { metadata: null });

      await dispatchApproval(ctx, 'product_update');

      const descUpdate = calls.find(
        (c) => c.sql.includes('UPDATE products SET description')
      );
      expect(descUpdate).toBeDefined();
      expect(descUpdate?.bind[0]).toBe('New description text');
    });

    it('returns early when product_id is missing', async () => {
      const { ctx, calls } = createMockCtx({ title: 'No Product ID' });

      await dispatchApproval(ctx, 'product_update');

      const metadataUpdate = calls.filter(
        (c) => c.sql.includes('UPDATE products SET metadata')
      );
      expect(metadataUpdate).toHaveLength(0);
    });
  });

  describe('ad_generation', () => {
    it('inserts ad generation history and updates draft', async () => {
      const { ctx, calls } = createMockCtx({
        request: { draftId: 5 },
        candidates: [
          {
            headlines: ['H1', 'H2'],
            descriptions: ['D1'],
            suggestedKeywords: ['kw1']
          }
        ],
        promptUsed: 'Generate ads for product X'
      });

      await dispatchApproval(ctx, 'ad_generation');

      const historyInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO ad_generation_history')
      );
      expect(historyInsert).toBeDefined();
      expect(historyInsert?.bind[0]).toBe(5);
      expect(historyInsert?.bind[1]).toBe('Generate ads for product X');

      const draftUpdate = calls.find((c) =>
        c.sql.includes('UPDATE ad_drafts')
      );
      expect(draftUpdate).toBeDefined();
    });

    it('skips draft update when draftId is missing', async () => {
      const { ctx, calls } = createMockCtx({
        request: {},
        candidates: [{ headlines: ['H1'], descriptions: ['D1'], suggestedKeywords: [] }],
        promptUsed: 'test prompt'
      });

      await dispatchApproval(ctx, 'ad_generation');

      const draftUpdate = calls.filter((c) =>
        c.sql.includes('UPDATE ad_drafts')
      );
      expect(draftUpdate).toHaveLength(0);
    });
  });

  describe('bulk_image_upload', () => {
    it('executes bulk upload and records audit log', async () => {
      const { ctx, calls } = createMockCtx({
        upload_items: [
          { product_id: 1, url: 'https://example.com/a.jpg' },
          { product_id: 2, url: 'https://example.com/b.jpg' }
        ]
      });

      await dispatchApproval(ctx, 'bulk_image_upload');

      const auditInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO audit_logs') &&
        (c.bind[1] as string) === 'bulk_image_upload_approved'
      );
      expect(auditInsert).toBeDefined();

      const inboxUpdate = calls.find((c) =>
        c.sql.includes('UPDATE inbox_items SET metadata')
      );
      expect(inboxUpdate).toBeDefined();
    });

    it('returns early when upload_items is empty', async () => {
      const { ctx, calls } = createMockCtx({ upload_items: [] });

      await dispatchApproval(ctx, 'bulk_image_upload');

      const auditInsert = calls.filter((c) =>
        c.sql.includes('INSERT INTO audit_logs')
      );
      expect(auditInsert).toHaveLength(0);
    });
  });

  describe('ai_content_draft', () => {
    it('applies product description and approves draft', async () => {
      const { ctx, calls, db } = createMockCtx({
        draftId: 20,
        contentType: 'product_description',
        refType: 'product',
        refId: 30
      });
      db._drafts.set(20, { generated_content: 'AI generated description' });

      await dispatchApproval(ctx, 'ai_content_draft');

      const productUpdate = calls.find(
        (c) => c.sql.includes('UPDATE products SET description')
      );
      expect(productUpdate).toBeDefined();
      expect(productUpdate?.bind[0]).toBe('AI generated description');

      const draftApprove = calls.find((c) =>
        c.sql.includes('UPDATE ai_content_drafts') && c.sql.includes("'approved'")
      );
      expect(draftApprove).toBeDefined();

      const auditLog = calls.find((c) =>
        c.sql.includes('INSERT INTO audit_logs') &&
        (c.bind[1] as string) === 'approve_ai_content'
      );
      expect(auditLog).toBeDefined();
    });

    it('extracts description from JSON content', async () => {
      const { ctx, calls, db } = createMockCtx({
        draftId: 21,
        contentType: 'product_description',
        refType: 'product',
        refId: 31
      });
      db._drafts.set(21, {
        generated_content: JSON.stringify({ description: 'Parsed from JSON' })
      });

      await dispatchApproval(ctx, 'ai_content_draft');

      const productUpdate = calls.find(
        (c) => c.sql.includes('UPDATE products SET description')
      );
      expect(productUpdate?.bind[0]).toBe('Parsed from JSON');
    });

    it('returns early when draftId is missing', async () => {
      const { ctx, calls } = createMockCtx({
        contentType: 'product_description',
        refType: 'product',
        refId: 32
      });

      await dispatchApproval(ctx, 'ai_content_draft');

      const draftApprove = calls.filter((c) =>
        c.sql.includes('UPDATE ai_content_drafts')
      );
      expect(draftApprove).toHaveLength(0);
    });

    it('returns early when draft does not exist', async () => {
      const { ctx, calls } = createMockCtx({
        draftId: 999,
        contentType: 'product_description',
        refType: 'product',
        refId: 33
      });

      await dispatchApproval(ctx, 'ai_content_draft');

      const productUpdate = calls.filter(
        (c) => c.sql.includes('UPDATE products SET description')
      );
      expect(productUpdate).toHaveLength(0);
    });
  });

  describe('ai_email_draft', () => {
    it('records audit log for email approval', async () => {
      const { ctx, calls } = createMockCtx({
        orderId: 100,
        customerEmail: 'test@example.com',
        subject: 'Order confirmation'
      });

      await dispatchApproval(ctx, 'ai_email_draft');

      const auditInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO audit_logs') &&
        (c.bind[1] as string) === 'approve_ai_email'
      );
      expect(auditInsert).toBeDefined();
      const meta = JSON.parse(auditInsert?.bind[3] as string);
      expect(meta.orderId).toBe(100);
      expect(meta.customerEmail).toBe('test@example.com');
    });
  });

  describe('ai_budget_alert', () => {
    it('records audit log for budget alert acknowledgement', async () => {
      const { ctx, calls } = createMockCtx({
        totalCost: 150,
        budgetLimit: 100,
        period: '2025-01'
      });

      await dispatchApproval(ctx, 'ai_budget_alert');

      const auditInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO audit_logs') &&
        (c.bind[1] as string) === 'acknowledge_ai_budget_alert'
      );
      expect(auditInsert).toBeDefined();
      const meta = JSON.parse(auditInsert?.bind[3] as string);
      expect(meta.totalCost).toBe(150);
      expect(meta.budgetLimit).toBe(100);
    });
  });

  it('catches and logs errors without re-throwing', async () => {
    const calls: { sql: string; bind: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ sql, bind: args });
            throw new Error('DB error');
          },
          run: async () => {
            calls.push({ sql, bind: args });
            throw new Error('DB error');
          }
        })
      })
    };

    const ctx = {
      db: db as any,
      r2: {} as R2Bucket,
      actor: 'admin',
      itemId: 1,
      metadata: JSON.stringify({ product_id: 1 })
    };

    // Should not throw
    await dispatchApproval(ctx, 'product_update');
  });
});
