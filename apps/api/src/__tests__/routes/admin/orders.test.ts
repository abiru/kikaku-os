import { describe, it, expect } from 'vitest';
import worker from '../../../../index';

const createMockDb = (results: Array<{
  order_id: number;
  customer_email: string | null;
  total: number;
  paid_at: string | null;
  fulfillment_id: number | null;
  fulfillment_status: string | null;
}>) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
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
        fulfillment_status: 'pending'
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
    expect(json.orders).toEqual(mockResults);
    expect(mockDb.calls.some((call) => call.sql.includes('FROM orders'))).toBe(true);
  });
});
