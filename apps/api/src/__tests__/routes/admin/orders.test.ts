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

const createMockDb = (results: Array<{
  order_id: number;
  customer_email: string | null;
  total: number;
  paid_at: string | null;
  fulfillment_id: number | null;
  fulfillment_status: string | null;
  tracking_number?: string | null;
  fulfillment_metadata?: string | null;
}>) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      // Direct methods (no bind) for RBAC middleware
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
          return { results };
        }
      })
    })
  };
};

describe('GET /admin/orders/ready-to-ship', () => {
  it('returns paid orders ready to ship', async () => {
    const mockResults = [
      {
        order_id: 101,
        customer_email: 'buyer@example.com',
        total: 5000,
        paid_at: '2024-05-01 10:00:00',
        fulfillment_id: 11,
        fulfillment_status: 'pending',
        tracking_number: null,
        fulfillment_metadata: null,
      }
    ];
    const mockDb = createMockDb(mockResults);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/ready-to-ship', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-admin-key' } as any,
      {
        waitUntil: () => {},
        passThroughOnException: () => {}
      } as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.orders).toEqual([
      {
        order_id: 101,
        customer_email: 'buyer@example.com',
        total: 5000,
        paid_at: '2024-05-01 10:00:00',
        fulfillment_id: 11,
        fulfillment_status: 'pending',
        tracking_number: null,
        carrier: null,
      }
    ]);
    expect(mockDb.calls.some((call) => call.sql.includes('FROM orders'))).toBe(true);
  });

  it('returns carrier from fulfillment metadata', async () => {
    const mockResults = [
      {
        order_id: 102,
        customer_email: 'test@example.com',
        total: 3000,
        paid_at: '2024-05-02 10:00:00',
        fulfillment_id: 12,
        fulfillment_status: 'pending',
        tracking_number: '1234-5678',
        fulfillment_metadata: JSON.stringify({ carrier: 'ヤマト運輸' }),
      }
    ];
    const mockDb = createMockDb(mockResults);

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/ready-to-ship', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' }
      }),
      { DB: mockDb, ADMIN_API_KEY: 'test-admin-key' } as any,
      {
        waitUntil: () => {},
        passThroughOnException: () => {}
      } as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.orders[0].carrier).toBe('ヤマト運輸');
    expect(json.orders[0].tracking_number).toBe('1234-5678');
  });
});
