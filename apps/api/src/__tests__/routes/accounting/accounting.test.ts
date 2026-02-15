import { describe, it, expect, vi } from 'vitest';
import worker from '../../../index';

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type ReportRow = {
  count: number;
  totalNet: number;
  totalFee: number;
  totalAmount?: number;
};

type LedgerEntry = {
  id: number;
  created_at: string;
  ref_type: string;
  ref_id: string;
  account: string;
  debit: number;
  credit: number;
  memo: string;
  currency: string;
};

const createMockEnv = (options: {
  ordersRow?: Partial<ReportRow> | null;
  paymentsRow?: Partial<ReportRow> | null;
  refundsRow?: Partial<{ count: number; totalAmount: number }> | null;
  ledgerEntries?: LedgerEntry[];
  noData?: boolean;
} = {}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const createQueryBuilder = (sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, bind: args });
      return createQueryBuilder(sql);
    },
    first: async () => {
      if (options.noData) {
        return { count: 0, totalNet: 0, totalFee: 0, totalAmount: 0, cnt: 0 };
      }
      // Daily report: orders
      if (sql.includes('FROM orders') && sql.includes('COUNT(*)')) {
        return options.ordersRow ?? { count: 5, totalNet: 25000, totalFee: 500 };
      }
      // Daily report: payments
      if (sql.includes('FROM payments') && sql.includes('COUNT(*)')) {
        return options.paymentsRow ?? { count: 5, totalAmount: 25000, totalFee: 500 };
      }
      // Daily report: refunds
      if (sql.includes('FROM refunds') && sql.includes('COUNT(*)')) {
        return options.refundsRow ?? { count: 1, totalAmount: 1000 };
      }
      // Journalize: existing entries count
      if (sql.includes('COUNT(*)') && sql.includes('ledger_entries')) {
        return { cnt: 0 };
      }
      // Tax total
      if (sql.includes('SUM(tax_amount)')) {
        return { taxTotal: 2000 };
      }
      return null;
    },
    all: async () => {
      // RBAC permissions
      if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
        return { results: ALL_ADMIN_PERMISSIONS };
      }
      // Ledger entries
      if (sql.includes('FROM ledger_entries')) {
        return { results: options.ledgerEntries || [] };
      }
      return { results: [] };
    },
    run: async () => ({ meta: { last_row_id: 1 } }),
  });

  return {
    calls,
    env: {
      DB: {
        prepare: (sql: string) => createQueryBuilder(sql),
      },
      ADMIN_API_KEY: 'test-admin-key',
    },
  };
};

const createCtx = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {},
});

describe('GET /reports/daily', () => {
  it('returns daily report for valid date', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/reports/daily?date=2026-01-15', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.report).toBeDefined();
    expect(json.report.date).toBe('2026-01-15');
    expect(json.report.orders).toBeDefined();
    expect(json.report.payments).toBeDefined();
    expect(json.report.refunds).toBeDefined();
    expect(json.report.anomalies).toBeDefined();
  });

  it('returns report with zero data', async () => {
    const { env } = createMockEnv({ noData: true });

    const res = await worker.fetch(
      new Request('http://localhost/reports/daily?date=2026-01-01', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.report.orders.count).toBe(0);
    expect(json.report.payments.count).toBe(0);
  });

  it('returns 400 for invalid date format', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/reports/daily?date=invalid-date', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Invalid date');
  });

  it('returns 400 for missing date', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/reports/daily', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /ledger-entries', () => {
  it('returns ledger entries for valid date', async () => {
    const ledgerEntries: LedgerEntry[] = [
      {
        id: 1,
        created_at: '2026-01-15T00:00:00Z',
        ref_type: 'daily_close',
        ref_id: '2026-01-15',
        account: 'acct_bank',
        debit: 24500,
        credit: 0,
        memo: 'Daily close net',
        currency: 'JPY',
      },
      {
        id: 2,
        created_at: '2026-01-15T00:00:00Z',
        ref_type: 'daily_close',
        ref_id: '2026-01-15',
        account: 'acct_sales',
        debit: 0,
        credit: 22500,
        memo: 'Daily close sales',
        currency: 'JPY',
      },
    ];

    const { env } = createMockEnv({ ledgerEntries });

    const res = await worker.fetch(
      new Request('http://localhost/ledger-entries?date=2026-01-15', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.entries).toBeDefined();
  });

  it('returns empty entries when no data exists', async () => {
    const { env } = createMockEnv({ ledgerEntries: [] });

    const res = await worker.fetch(
      new Request('http://localhost/ledger-entries?date=2026-12-31', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
  });

  it('returns 400 for invalid date', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/ledger-entries?date=not-a-date', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Invalid date');
  });

  it('returns 400 for missing date', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/ledger-entries', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });
});
