import { describe, it, expect } from 'vitest';
import worker from '../../../index';

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type ExportRow = {
  order_id: number;
  date: string;
  customer_email: string | null;
  product_title: string | null;
  variant_title: string | null;
  quantity: number;
  amount: number;
  status: string;
};

const createMockDb = (exportRows: ExportRow[]) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      all: async () => {
        calls.push({ sql, bind: [] });
        if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
          return { results: ALL_ADMIN_PERMISSIONS };
        }
        return { results: [] };
      },
      first: async () => {
        calls.push({ sql, bind: [] });
        return undefined;
      },
      run: async () => {
        calls.push({ sql, bind: [] });
        return { meta: {} };
      },
      bind: (...args: unknown[]) => ({
        all: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
            return { results: ALL_ADMIN_PERMISSIONS };
          }
          if (sql.includes('FROM orders')) {
            return { results: exportRows };
          }
          return { results: [] };
        },
        first: async () => {
          calls.push({ sql, bind: args });
          return undefined;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { meta: {} };
        },
      }),
    }),
  };
};

const execCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

describe('GET /admin/orders/export', () => {
  it('returns CSV with correct headers', async () => {
    const rows: ExportRow[] = [
      {
        order_id: 1,
        date: '2026-01-10 09:00:00',
        customer_email: 'test@example.com',
        product_title: 'テスト商品',
        variant_title: 'Sサイズ',
        quantity: 2,
        amount: 3000,
        status: 'paid',
      },
    ];
    const mockDb = createMockDb(rows);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-01-01&to=2026-01-31', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('orders_2026-01-01_2026-01-31.csv');

    const text = await res.text();
    const lines = text.split('\n');
    expect(lines[0]).toBe('order_id,date,customer_email,product_name,quantity,amount,status');
    expect(lines[1]).toContain('1');
    expect(lines[1]).toContain('test@example.com');
    expect(lines[1]).toContain('テスト商品 - Sサイズ');
    expect(lines[1]).toContain('paid');
  });

  it('returns empty CSV with header only when no data', async () => {
    const mockDb = createMockDb([]);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-01-01&to=2026-01-31', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('order_id,date,customer_email,product_name,quantity,amount,status');
  });

  it('returns 400 when from is after to', async () => {
    const mockDb = createMockDb([]);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-02-01&to=2026-01-01', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(400);
    const json = await res.json() as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
  });

  it('returns 400 for invalid date format', async () => {
    const mockDb = createMockDb([]);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026/01/01&to=2026-01-31', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const mockDb = createMockDb([]);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-01-01&to=2026-01-31', {
        method: 'GET',
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(401);
  });

  it('escapes CSV fields with commas and quotes', async () => {
    const rows: ExportRow[] = [
      {
        order_id: 2,
        date: '2026-01-15 12:00:00',
        customer_email: 'user@example.com',
        product_title: 'Product, with "comma"',
        variant_title: null,
        quantity: 1,
        amount: 5000,
        status: 'paid',
      },
    ];
    const mockDb = createMockDb(rows);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-01-01&to=2026-01-31', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    // Field with comma and quotes should be properly escaped
    expect(text).toContain('"Product, with ""comma"""');
  });

  it('passes date range to SQL query', async () => {
    const mockDb = createMockDb([]);

    await worker.fetch(
      new Request('http://localhost/admin/orders/export?from=2026-02-01&to=2026-02-28', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' },
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-key' } as any,
      execCtx
    );

    const orderQuery = mockDb.calls.find((call) => call.sql.includes('FROM orders'));
    expect(orderQuery).toBeDefined();
    expect(orderQuery?.bind).toContain('2026-02-01');
    expect(orderQuery?.bind).toContain('2026-02-28');
  });
});
