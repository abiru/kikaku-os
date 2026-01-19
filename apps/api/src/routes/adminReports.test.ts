import { describe, it, expect, vi } from 'vitest';
import worker from '../index';

const createMockEnv = (overrides: any = {}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const defaultResults: Record<string, any> = {
    todayStats: { order_count: 5, revenue: 25000 },
    todayRefunds: { refund_total: 1000 },
    weekStats: { order_count: 20, revenue: 100000 },
    weekRefunds: { refund_total: 3000 },
    pendingInbox: { count: 3 },
    unfulfilledOrders: { count: 2 },
    recentOrders: {
      results: [
        { id: 101, customer_email: 'test@example.com', total_net: 5000, currency: 'JPY', status: 'paid', created_at: '2026-01-20T10:00:00Z' }
      ]
    },
    recentInbox: {
      results: [
        { id: 1, title: 'Low Stock Alert', severity: 'warning', kind: 'low_stock', created_at: '2026-01-20T09:00:00Z' }
      ]
    },
    document: { r2_key: 'reports/2026-01-19/daily-close.html', content_type: 'text/html' },
    reportsCount: { count: 5 },
    reportsList: {
      results: [
        { id: 1, date: '2026-01-19', path: 'reports/2026-01-19/daily-close.html', created_at: '2026-01-20T00:00:00Z' }
      ]
    },
    ledgerCount: { count: 10 },
    ledgerEntries: {
      results: [
        {
          id: 1,
          created_at: '2026-01-20T10:00:00Z',
          ref_type: 'order',
          ref_id: '101',
          memo: 'Order payment',
          debit: 5000,
          credit: 0,
          currency: 'JPY',
          account_name: 'Sales'
        }
      ]
    },
    ...overrides
  };

  const getFirstResult = (sql: string) => {
    if (sql.includes('order_count') && sql.includes("substr(created_at, 1, 10) = ?")) {
      return defaultResults.todayStats;
    }
    if (sql.includes('refund_total') && sql.includes("substr(created_at, 1, 10) = ?")) {
      return defaultResults.todayRefunds;
    }
    if (sql.includes('order_count') && sql.includes("substr(created_at, 1, 10) >= ?")) {
      return defaultResults.weekStats;
    }
    if (sql.includes('refund_total') && sql.includes("substr(created_at, 1, 10) >= ?")) {
      return defaultResults.weekRefunds;
    }
    if (sql.includes('inbox_items') && sql.includes('COUNT(*)')) {
      return defaultResults.pendingInbox;
    }
    if (sql.includes('FROM orders o') && sql.includes('COUNT(*)') && !sql.includes('LEFT JOIN customers')) {
      return defaultResults.unfulfilledOrders;
    }
    if (sql.includes('r2_key') && sql.includes('documents')) {
      return defaultResults.document;
    }
    if (sql.includes('COUNT(*)') && sql.includes("ref_type = 'daily_close'")) {
      return defaultResults.reportsCount;
    }
    if (sql.includes('COUNT(*)') && sql.includes('ledger_entries')) {
      return defaultResults.ledgerCount;
    }
    return null;
  };

  const getAllResult = (sql: string) => {
    if (sql.includes('FROM orders o') && sql.includes('LEFT JOIN customers')) {
      return defaultResults.recentOrders;
    }
    if (sql.includes('FROM inbox_items') && sql.includes('ORDER BY')) {
      return defaultResults.recentInbox;
    }
    if (sql.includes('FROM documents') && sql.includes("ref_type = 'daily_close'")) {
      return defaultResults.reportsList;
    }
    if (sql.includes('FROM ledger_entries')) {
      return defaultResults.ledgerEntries;
    }
    return { results: [] };
  };

  const createQueryBuilder = (sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, bind: args });
      return createQueryBuilder(sql);
    },
    first: async () => getFirstResult(sql),
    all: async () => getAllResult(sql),
    run: async () => ({ meta: { last_row_id: 1 } })
  });

  const mockDb = {
    calls,
    prepare: (sql: string) => createQueryBuilder(sql)
  };

  const mockR2Body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html>Report Content</html>'));
      controller.close();
    }
  });

  const mockR2 = {
    get: vi.fn().mockResolvedValue({
      body: mockR2Body,
      httpMetadata: { contentType: 'text/html' }
    })
  };

  return {
    DB: mockDb,
    R2: mockR2,
    ADMIN_API_KEY: 'test-admin-key'
  };
};

const createCtx = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {}
});

describe('GET /admin/dashboard', () => {
  it('returns dashboard data with KPIs and recent activity', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/dashboard', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.today).toBeDefined();
    expect(json.today.orders).toBe(5);
    expect(json.today.revenue).toBe(25000);
    expect(json.week).toBeDefined();
    expect(json.week.orders).toBe(20);
    expect(json.pending).toBeDefined();
    expect(json.pending.inbox).toBe(3);
    expect(json.pending.unfulfilled).toBe(2);
    expect(json.recentOrders).toHaveLength(1);
    expect(json.recentInbox).toHaveLength(1);
  });

  it('returns 401 without admin key', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/dashboard', {
        method: 'GET'
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/documents/:id/download', () => {
  it('returns document from R2 with proper headers', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/documents/1/download', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(env.R2.get).toHaveBeenCalledWith('reports/2026-01-19/daily-close.html');
  });

  it('returns 404 for non-existent document', async () => {
    const env = createMockEnv({ document: null });

    const res = await worker.fetch(
      new Request('http://localhost/admin/documents/999/download', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid document ID', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/documents/invalid/download', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without admin key', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/documents/1/download', {
        method: 'GET'
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/reports', () => {
  it('returns paginated list of reports', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/reports?page=1&perPage=20', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.reports).toHaveLength(1);
    expect(json.meta.totalCount).toBe(5);
    expect(json.meta.page).toBe(1);
  });
});

describe('GET /admin/ledger', () => {
  it('returns paginated list of ledger entries', async () => {
    const env = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/ledger?page=1&perPage=50', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.entries).toHaveLength(1);
    expect(json.meta.totalCount).toBe(10);
  });
});
