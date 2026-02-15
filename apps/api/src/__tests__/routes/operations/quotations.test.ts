import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import quotations from '../../../routes/checkout/quotations';

type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  amount: number;
  currency: string;
  tax_rate: number | null;
};

const createMockDb = (options: {
  variantRows?: VariantPriceRow[];
  quotationRow?: any;
  quotationItems?: any[];
  orderRow?: any;
  lastRowId?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM variants')) {
            return { results: options.variantRows || [] };
          }
          if (sql.includes('FROM quotation_items')) {
            return { results: options.quotationItems || [] };
          }
          if (sql.includes('FROM quotations')) {
            return { results: [options.quotationRow].filter(Boolean) };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('FROM quotations')) {
            return options.quotationRow ?? null;
          }
          if (sql.includes('FROM orders')) {
            return options.orderRow ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          success: true,
          meta: { last_row_id: options.lastRowId || 1 }
        }))
      })),
      all: vi.fn(async () => {
        if (sql.includes('FROM variants')) {
          return { results: options.variantRows || [] };
        }
        if (sql.includes('FROM quotations')) {
          return { results: [options.quotationRow].filter(Boolean) };
        }
        return { results: [] };
      }),
      first: vi.fn(async () => {
        if (sql.includes('FROM quotations')) {
          return options.quotationRow ?? null;
        }
        if (sql.includes('FROM orders')) {
          return options.orderRow ?? null;
        }
        return null;
      }),
      run: vi.fn(async () => ({
        success: true,
        meta: { last_row_id: options.lastRowId || 1 }
      }))
    }))
  };
};

const createApp = (db: ReturnType<typeof createMockDb>, env = {}) => {
  const app = new Hono();
  app.route('/', quotations);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ...env } as any)
  };
};

describe('Quotations API', () => {
  describe('POST /quotations', () => {
    it('creates a quotation successfully', async () => {
      const variantRows: VariantPriceRow[] = [
        {
          variant_id: 1,
          variant_title: 'Default',
          product_id: 1,
          product_title: 'Test Product',
          amount: 1100,
          currency: 'JPY',
          tax_rate: 0.10
        }
      ];

      const db = createMockDb({ variantRows, lastRowId: 1 });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCompany: 'Test Company',
          customerName: 'Test User',
          items: [{ variantId: 1, quantity: 2 }]
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.quotationNumber).toBe('EST-0001');
      // Prices are tax-inclusive (税込): ¥1,100 × 2 = ¥2,200
      // subtotal = floor(2200 * 100 / 110) = 2000
      // taxAmount = 2200 - 2000 = 200
      expect(data.subtotal).toBe(2000);
      expect(data.taxAmount).toBe(200);
      expect(data.totalAmount).toBe(2200);
    });

    it('returns error when customerCompany is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const response = await fetch('/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Test User',
          items: [{ variantId: 1, quantity: 2 }]
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.ok).toBe(false);
      expect(data.message).toContain('customerCompany');
    });

    it('returns error when items array is empty', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const response = await fetch('/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCompany: 'Test Company',
          customerName: 'Test User',
          items: []
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.ok).toBe(false);
      expect(data.message).toContain('items');
    });

    it('calculates tax correctly with standard rate (10%)', async () => {
      const variantRows: VariantPriceRow[] = [
        {
          variant_id: 1,
          variant_title: 'Default',
          product_id: 1,
          product_title: 'Test Product',
          amount: 11000,
          currency: 'JPY',
          tax_rate: 0.10
        }
      ];

      const db = createMockDb({ variantRows, lastRowId: 1 });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCompany: 'Test Company',
          customerName: 'Test User',
          items: [{ variantId: 1, quantity: 1 }]
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      // Tax-inclusive ¥11,000: subtotal = floor(11000 * 100 / 110) = 10000
      expect(data.subtotal).toBe(10000);
      expect(data.taxAmount).toBe(1000);
      expect(data.totalAmount).toBe(11000);
    });

    it('calculates tax correctly with reduced rate (8%)', async () => {
      const variantRows: VariantPriceRow[] = [
        {
          variant_id: 1,
          variant_title: 'Default',
          product_id: 1,
          product_title: 'Food Product',
          amount: 1080,
          currency: 'JPY',
          tax_rate: 0.08
        }
      ];

      const db = createMockDb({ variantRows, lastRowId: 1 });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCompany: 'Test Company',
          customerName: 'Test User',
          items: [{ variantId: 1, quantity: 1 }]
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      // Tax-inclusive ¥1,080 at 8%: subtotal = floor(1080 * 100 / 108) = 1000
      expect(data.subtotal).toBe(1000);
      expect(data.taxAmount).toBe(80);
      expect(data.totalAmount).toBe(1080);
    });
  });

  describe('GET /quotations/:id', () => {
    it('returns quotation details', async () => {
      const quotationRow = {
        id: 1,
        quotation_number: 'EST-0001',
        customer_company: 'Test Company',
        customer_name: 'Test User',
        subtotal: 2000,
        tax_amount: 200,
        total_amount: 2200,
        currency: 'JPY',
        status: 'draft',
        valid_until: '2026-02-20',
        created_at: '2026-01-21T00:00:00Z'
      };

      const quotationItems = [
        {
          id: 1,
          quotation_id: 1,
          variant_id: 1,
          product_title: 'Test Product',
          variant_title: 'Default',
          quantity: 2,
          unit_price: 1000,
          subtotal: 2000
        }
      ];

      const db = createMockDb({ quotationRow, quotationItems });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations/1');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.quotation.quotation_number).toBe('EST-0001');
      expect(data.items).toHaveLength(1);
    });

    it('returns error for invalid ID', async () => {
      const db = createMockDb({ quotationRow: null });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations/invalid');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.ok).toBe(false);
    });

    it('returns error when quotation not found', async () => {
      const db = createMockDb({ quotationRow: null });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations/999');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.ok).toBe(false);
    });
  });

  describe('GET /quotations', () => {
    it('returns quotations list', async () => {
      const quotationRow = {
        id: 1,
        quotation_number: 'EST-0001',
        customer_company: 'Test Company',
        status: 'draft'
      };

      const db = createMockDb({ quotationRow });
      const { fetch } = createApp(db);

      const response = await fetch('/quotations');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.quotations).toBeDefined();
      expect(data.meta).toBeDefined();
    });

    it('supports pagination', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const response = await fetch('/quotations?page=2&perPage=10');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.meta.page).toBe(2);
      expect(data.meta.perPage).toBe(10);
    });

    it('supports status filtering', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const response = await fetch('/quotations?status=draft');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
    });
  });

  describe('DELETE /quotations/:id', () => {
    const adminEnv = { ADMIN_API_KEY: 'test-admin-key' };
    const adminHeaders = { 'x-admin-key': 'test-admin-key' };

    it('requires admin key', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db, adminEnv);

      const response = await fetch('/quotations/1', { method: 'DELETE' });
      expect(response.status).toBe(401);
    });

    it('returns 409 when quotation is accepted', async () => {
      const db = createMockDb({
        quotationRow: { id: 1, status: 'accepted', converted_order_id: null }
      });
      const { fetch } = createApp(db, adminEnv);

      const response = await fetch('/quotations/1', {
        method: 'DELETE',
        headers: adminHeaders
      });

      expect(response.status).toBe(409);
    });

    it('returns 409 when linked order is active', async () => {
      const db = createMockDb({
        quotationRow: { id: 1, status: 'draft', converted_order_id: 10 },
        orderRow: { id: 10, status: 'paid' }
      });
      const { fetch } = createApp(db, adminEnv);

      const response = await fetch('/quotations/1', {
        method: 'DELETE',
        headers: adminHeaders
      });

      expect(response.status).toBe(409);
    });

    it('deletes quotation when linked order is cancelled', async () => {
      const db = createMockDb({
        quotationRow: { id: 1, status: 'draft', converted_order_id: 10 },
        orderRow: { id: 10, status: 'cancelled' }
      });
      const { fetch } = createApp(db, adminEnv);

      const response = await fetch('/quotations/1', {
        method: 'DELETE',
        headers: adminHeaders
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.deleted).toBe(true);
    });
  });
});
