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
};

const createMockDb = (options: {
  variantRows?: VariantPriceRow[];
  quotationRow?: any;
  quotationItems?: any[];
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
          amount: 1000,
          currency: 'JPY'
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

    it('calculates tax correctly', async () => {
      const variantRows: VariantPriceRow[] = [
        {
          variant_id: 1,
          variant_title: 'Default',
          product_id: 1,
          product_title: 'Test Product',
          amount: 10000,
          currency: 'JPY'
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
      expect(data.subtotal).toBe(10000);
      expect(data.taxAmount).toBe(1000); // 10% of 10000
      expect(data.totalAmount).toBe(11000);
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
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const response = await fetch('/quotations/invalid');

      expect(response.status).toBe(400);
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
});
