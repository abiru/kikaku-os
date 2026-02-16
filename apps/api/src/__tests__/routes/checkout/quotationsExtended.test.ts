import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import quotations from '../../../routes/checkout/quotations';

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

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
  customersRow?: any;
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
          if (sql.includes('FROM quotations') && !sql.includes('COUNT(*)')) {
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
          if (sql.includes('FROM customers')) {
            return options.customersRow ?? null;
          }
          if (sql.includes('COUNT(*)')) {
            return { count: options.quotationRow ? 1 : 0 };
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
        if (sql.includes('FROM quotations') && !sql.includes('COUNT(*)')) {
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
        if (sql.includes('COUNT(*)')) {
          return { count: options.quotationRow ? 1 : 0 };
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

describe('Quotation Expiration', () => {
  it('rejects acceptance of expired quotation', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const validUntil = pastDate.toISOString().split('T')[0];

    const quotationRow = {
      id: 1,
      quotation_number: 'EST-0001',
      customer_company: 'Test Company',
      customer_name: 'Test User',
      customer_email: 'test@example.com',
      subtotal: 10000,
      tax_amount: 1000,
      total_amount: 11000,
      currency: 'JPY',
      status: 'draft',
      valid_until: validUntil,
      public_token: 'tok_expired',
      created_at: '2026-01-01T00:00:00Z'
    };

    const db = createMockDb({ quotationRow });
    const { fetch } = createApp(db, {
      STRIPE_SECRET_KEY: 'sk_test_xxx',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    });

    const response = await fetch('/quotations/tok_expired/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('expired');
  });

  it('rejects acceptance of already-accepted quotation', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const validUntil = futureDate.toISOString().split('T')[0];

    const quotationRow = {
      id: 2,
      quotation_number: 'EST-0002',
      customer_company: 'Test Company',
      customer_name: 'Test User',
      subtotal: 5000,
      tax_amount: 500,
      total_amount: 5500,
      currency: 'JPY',
      status: 'accepted',
      valid_until: validUntil,
      public_token: 'tok_accepted',
      created_at: '2026-01-01T00:00:00Z'
    };

    const db = createMockDb({ quotationRow });
    const { fetch } = createApp(db, {
      STRIPE_SECRET_KEY: 'sk_test_xxx',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    });

    const response = await fetch('/quotations/tok_accepted/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('status');
  });

  it('returns 404 for non-existent quotation token on accept', async () => {
    const db = createMockDb({ quotationRow: null });
    const { fetch } = createApp(db, {
      STRIPE_SECRET_KEY: 'sk_test_xxx',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    });

    const response = await fetch('/quotations/tok_nonexistent/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.ok).toBe(false);
  });
});

describe('Quotation Tax Calculation - Mixed rates', () => {
  it('handles multiple items with different tax rates', async () => {
    const variantRows: VariantPriceRow[] = [
      {
        variant_id: 1,
        variant_title: 'Default',
        product_id: 1,
        product_title: 'Standard Item',
        amount: 1100,
        currency: 'JPY',
        tax_rate: 0.10
      },
      {
        variant_id: 2,
        variant_title: 'Default',
        product_id: 2,
        product_title: 'Reduced Rate Item',
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
        customerCompany: 'Mixed Tax Company',
        customerName: 'Tax Test',
        items: [
          { variantId: 1, quantity: 1 },
          { variantId: 2, quantity: 1 }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    // Total should be 1100 + 1080 = 2180 (both are tax-inclusive prices)
    expect(data.totalAmount).toBe(2180);
  });

  it('handles items without tax rate (defaults to 10%)', async () => {
    const variantRows: VariantPriceRow[] = [
      {
        variant_id: 1,
        variant_title: 'Default',
        product_id: 1,
        product_title: 'No Tax Rate Product',
        amount: 5500,
        currency: 'JPY',
        tax_rate: null
      }
    ];

    const db = createMockDb({ variantRows, lastRowId: 1 });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerCompany: 'Default Tax Co',
        customerName: 'Default Test',
        items: [{ variantId: 1, quantity: 1 }]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    // With null tax_rate, defaults to 10%
    // Tax-inclusive: ¥5,500: subtotal = floor(5500 * 100 / 110) = 5000
    expect(data.subtotal).toBe(5000);
    expect(data.taxAmount).toBe(500);
    expect(data.totalAmount).toBe(5500);
  });
});

describe('Quotation Validation Edge Cases', () => {
  it('rejects request with too many items (over 20)', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const items = Array.from({ length: 21 }, (_, i) => ({
      variantId: i + 1,
      quantity: 1
    }));

    const response = await fetch('/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerCompany: 'Test',
        customerName: 'Test',
        items
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Too many items');
  });

  it('rejects when customerName is missing', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const response = await fetch('/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerCompany: 'Test Company',
        items: [{ variantId: 1, quantity: 1 }]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('customerName');
  });

  it('rejects invalid JSON body', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const response = await fetch('/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json'
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
  });

  it('returns 404 when variant not found', async () => {
    const db = createMockDb({ variantRows: [] });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerCompany: 'Test Company',
        customerName: 'Test User',
        items: [{ variantId: 999, quantity: 1 }]
      })
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Variant 999 not found');
  });
});

describe('Quotation GET Endpoints', () => {
  it('GET /quotations/:token returns quotation by public token', async () => {
    const quotationRow = {
      id: 1,
      quotation_number: 'EST-0001',
      customer_company: 'Test Company',
      customer_name: 'Test User',
      subtotal: 10000,
      tax_amount: 1000,
      total_amount: 11000,
      currency: 'JPY',
      status: 'draft',
      valid_until: '2026-03-01',
      public_token: 'tok_valid',
      created_at: '2026-02-01T00:00:00Z'
    };

    const quotationItems = [
      {
        id: 1,
        quotation_id: 1,
        variant_id: 1,
        product_title: 'Test Product',
        variant_title: 'Default',
        quantity: 1,
        unit_price: 10000,
        subtotal: 10000
      }
    ];

    const db = createMockDb({ quotationRow, quotationItems });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations/tok_valid');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.quotation.quotation_number).toBe('EST-0001');
    expect(data.items).toHaveLength(1);
  });

  it('GET /quotations/:token returns 404 for unknown token', async () => {
    const db = createMockDb({ quotationRow: null });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations/tok_unknown');
    expect(response.status).toBe(404);
  });

  it('GET /quotations list returns paginated results', async () => {
    const quotationRow = {
      id: 1,
      quotation_number: 'EST-0001',
      customer_company: 'Test',
      status: 'draft'
    };

    const db = createMockDb({ quotationRow });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations?page=1&perPage=10');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.quotations).toBeDefined();
    expect(data.meta).toBeDefined();
    expect(data.meta.page).toBe(1);
    expect(data.meta.perPage).toBe(10);
  });

  it('GET /quotations with status filter', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const response = await fetch('/quotations?status=draft');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });

  it('GET /quotations rejects invalid pagination params', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const response = await fetch('/quotations?perPage=200');
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
  });
});

describe('Quotation Delete - Extended', () => {
  it('returns 404 when quotation does not exist', async () => {
    const db = createMockDb({ quotationRow: null });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations/999', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid quotation ID', async () => {
    const db = createMockDb({});
    const { fetch } = createApp(db);

    const response = await fetch('/quotations/0', {
      method: 'DELETE',
    });

    expect(response.status).toBe(400);
  });

  it('deletes draft quotation without linked order', async () => {
    const db = createMockDb({
      quotationRow: { id: 1, status: 'draft', converted_order_id: null }
    });
    const { fetch } = createApp(db);

    const response = await fetch('/quotations/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe(true);
  });
});
