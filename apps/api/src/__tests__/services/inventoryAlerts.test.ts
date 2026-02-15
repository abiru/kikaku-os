import { describe, it, expect } from 'vitest';
import { checkInventoryAlerts } from '../../services/inventoryAlerts';

type LowStockItem = {
  variant_id: number;
  on_hand: number;
  threshold: number;
  variant_title: string | null;
  product_title: string | null;
};

const createMockEnv = (lowStockItems: LowStockItem[], opts?: { failOnInsert?: boolean }) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const DB = {
    prepare: (sql: string) => ({
      all: async <T>() => {
        calls.push({ sql, bind: [] });
        return { results: lowStockItems as T[] };
      },
      bind: (...args: unknown[]) => ({
        all: async <T>() => {
          calls.push({ sql, bind: args });
          return { results: lowStockItems as T[] };
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (opts?.failOnInsert && sql.includes('INSERT INTO inbox_items')) {
            throw new Error('UNIQUE constraint failed: inbox_items.kind, inbox_items.date');
          }
          return { meta: { last_row_id: 1 } };
        },
      }),
    }),
  };
  return { calls, env: { DB } as unknown as { DB: D1Database } };
};

describe('checkInventoryAlerts', () => {
  it('creates alerts for low-stock items', async () => {
    const lowStockItems: LowStockItem[] = [
      {
        variant_id: 1,
        on_hand: 3,
        threshold: 10,
        variant_title: 'Sサイズ',
        product_title: 'テストTシャツ',
      },
    ];
    const { calls, env } = createMockEnv(lowStockItems);

    const result = await checkInventoryAlerts(env, '2026-02-15');

    expect(result.alertsCreated).toBe(1);

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO inbox_items'));
    expect(insertCall).toBeDefined();
    expect(insertCall?.bind[0]).toContain('テストTシャツ');
    expect(insertCall?.bind[0]).toContain('Sサイズ');
    // severity should be warning (on_hand > 0)
    expect(insertCall?.bind[2]).toBe('warning');
    // kind should include variant_id
    expect(insertCall?.bind[3]).toBe('inventory_low_1');
    // date
    expect(insertCall?.bind[4]).toBe('2026-02-15');
  });

  it('sets critical severity when stock is zero', async () => {
    const lowStockItems: LowStockItem[] = [
      {
        variant_id: 5,
        on_hand: 0,
        threshold: 5,
        variant_title: 'Default',
        product_title: '品切れ商品',
      },
    ];
    const { calls, env } = createMockEnv(lowStockItems);

    const result = await checkInventoryAlerts(env, '2026-02-15');

    expect(result.alertsCreated).toBe(1);

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO inbox_items'));
    expect(insertCall?.bind[2]).toBe('critical');
  });

  it('returns zero when no low-stock items', async () => {
    const { env } = createMockEnv([]);

    const result = await checkInventoryAlerts(env, '2026-02-15');

    expect(result.alertsCreated).toBe(0);
  });

  it('handles duplicate alert gracefully (frequency control)', async () => {
    const lowStockItems: LowStockItem[] = [
      {
        variant_id: 1,
        on_hand: 2,
        threshold: 10,
        variant_title: 'M',
        product_title: 'Product A',
      },
    ];
    const { env } = createMockEnv(lowStockItems, { failOnInsert: true });

    const result = await checkInventoryAlerts(env, '2026-02-15');

    // Should not throw and should report 0 alerts created
    expect(result.alertsCreated).toBe(0);
  });

  it('creates alerts for multiple low-stock items', async () => {
    const lowStockItems: LowStockItem[] = [
      {
        variant_id: 1,
        on_hand: 2,
        threshold: 5,
        variant_title: 'S',
        product_title: 'Shirt',
      },
      {
        variant_id: 2,
        on_hand: 0,
        threshold: 3,
        variant_title: 'M',
        product_title: 'Pants',
      },
    ];
    const { calls, env } = createMockEnv(lowStockItems);

    const result = await checkInventoryAlerts(env, '2026-02-15');

    expect(result.alertsCreated).toBe(2);

    const insertCalls = calls.filter((c) => c.sql.includes('INSERT INTO inbox_items'));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].bind[3]).toBe('inventory_low_1');
    expect(insertCalls[1].bind[3]).toBe('inventory_low_2');
  });

  it('uses fallback name when product/variant titles are null', async () => {
    const lowStockItems: LowStockItem[] = [
      {
        variant_id: 99,
        on_hand: 1,
        threshold: 10,
        variant_title: null,
        product_title: null,
      },
    ];
    const { calls, env } = createMockEnv(lowStockItems);

    await checkInventoryAlerts(env, '2026-02-15');

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO inbox_items'));
    expect(insertCall?.bind[0]).toContain('Variant #99');
  });
});
