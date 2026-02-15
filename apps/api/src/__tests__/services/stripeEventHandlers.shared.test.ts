import { describe, it, expect, vi } from 'vitest';
import { recordCouponUsage, runStatements } from '../../services/stripeEventHandlers/shared';

const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const mockDb = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('SELECT customer_id FROM orders WHERE id')) {
            const orderMap = mockDb._orders as Map<number, { customer_id: number | null }>;
            return orderMap.get(Number(args[0])) ?? null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { success: true };
        }
      })
    }),
    batch: vi.fn(async (stmts: any[]) => {
      for (const stmt of stmts) {
        await stmt.run();
      }
    }),
    _orders: new Map<number, { customer_id: number | null }>()
  };

  return { db: mockDb, calls };
};

describe('shared - recordCouponUsage', () => {
  it('records coupon usage when metadata has valid couponId and discountAmount', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(1, { customer_id: 10 });

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { couponId: '5', discountAmount: '500' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeDefined();
    expect(usageInsert?.bind[0]).toBe(5);
    expect(usageInsert?.bind[1]).toBe(1);
    expect(usageInsert?.bind[2]).toBe(10);
    expect(usageInsert?.bind[3]).toBe(500);

    const couponUpdate = calls.find((c) =>
      c.sql.includes('UPDATE coupons') && c.sql.includes('current_uses')
    );
    expect(couponUpdate).toBeDefined();
    expect(couponUpdate?.bind[0]).toBe(5);
  });

  it('returns early when couponId is missing', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { discountAmount: '500' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when discountAmount is missing', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { couponId: '5' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when metadata is null', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage({ DB: db } as any, 1, null);

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when metadata is undefined', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage({ DB: db } as any, 1, undefined);

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when couponId is zero', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { couponId: '0', discountAmount: '500' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when discountAmount is zero', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { couponId: '5', discountAmount: '0' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('returns early when order does not exist', async () => {
    const { db, calls } = createMockEnv();
    // No orders in the map

    await recordCouponUsage(
      { DB: db } as any,
      999,
      { couponId: '5', discountAmount: '500' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });

  it('handles null customer_id gracefully', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(2, { customer_id: null });

    await recordCouponUsage(
      { DB: db } as any,
      2,
      { couponId: '3', discountAmount: '200' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeDefined();
    expect(usageInsert?.bind[2]).toBeNull();
  });

  it('returns early when couponId is non-numeric', async () => {
    const { db, calls } = createMockEnv();

    await recordCouponUsage(
      { DB: db } as any,
      1,
      { couponId: 'abc', discountAmount: '500' }
    );

    const usageInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO coupon_usages')
    );
    expect(usageInsert).toBeUndefined();
  });
});

describe('shared - runStatements', () => {
  it('uses batch when available', async () => {
    const { db } = createMockEnv();
    const stmts = [
      db.prepare('SELECT 1').bind(),
      db.prepare('SELECT 2').bind()
    ];

    await runStatements(db as any, stmts as any);

    expect(db.batch).toHaveBeenCalled();
  });

  it('falls back to sequential execution when batch is unavailable', async () => {
    const calls: string[] = [];
    const mockDb = {
      batch: undefined
    };

    const mockStmts = [
      { run: vi.fn(async () => { calls.push('stmt1'); }) },
      { run: vi.fn(async () => { calls.push('stmt2'); }) }
    ];

    await runStatements(mockDb as any, mockStmts as any);

    expect(calls).toEqual(['stmt1', 'stmt2']);
    expect(mockStmts[0].run).toHaveBeenCalled();
    expect(mockStmts[1].run).toHaveBeenCalled();
  });
});
