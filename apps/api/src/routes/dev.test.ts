import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import dev from './dev';

type StripeProvisionRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
};

const createMockDb = (options: {
  candidates?: StripeProvisionRow[];
  configuredCount?: number;
  missingMappingCount?: number;
}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (sql.includes('JOIN prices pr') && sql.includes('COALESCE(TRIM(pr.provider_price_id)')) {
            return { results: options.candidates ?? [] };
          }
          if (sql.includes('LEFT JOIN prices')) {
            const count = options.missingMappingCount ?? 0;
            return {
              results: Array.from({ length: count }, (_, index) => ({ variant_id: index + 1 }))
            };
          }
          return { results: [] };
        },
        first: async () => {
          if (sql.includes('COUNT(*)')) {
            return { count: options.configuredCount ?? 0 };
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

describe('POST /dev/provision-stripe-prices', () => {
  it('provisions prices with missing provider_price_id', async () => {
    const app = new Hono();
    app.route('/dev', dev);

    const mockDb = createMockDb({
      candidates: [
        {
          variant_id: 10,
          variant_title: 'Standard',
          product_id: 1,
          product_title: 'Sample',
          price_id: 99,
          amount: 1200,
          currency: 'JPY'
        }
      ],
      configuredCount: 0,
      missingMappingCount: 0
    });

    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/products/search')) {
        return {
          ok: true,
          json: async () => ({ data: [] })
        } as Response;
      }
      if (urlStr.includes('/v1/products')) {
        return {
          ok: true,
          json: async () => ({ id: 'prod_test_123' })
        } as Response;
      }
      if (urlStr.includes('/v1/prices')) {
        return {
          ok: true,
          json: async () => ({ id: 'price_test_123' })
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => 'not found'
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request(
      'http://localhost/dev/provision-stripe-prices',
      { method: 'POST' },
      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updated_count).toBe(1);
    expect(json.errors_count).toBe(0);
    expect(json.skipped_already_configured_count).toBe(0);
    expect(json.skipped_missing_mapping_count).toBe(0);
    expect(mockDb.calls.some((call) => call.sql.includes('UPDATE prices'))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('skips already configured prices', async () => {
    const app = new Hono();
    app.route('/dev', dev);

    const mockDb = createMockDb({
      candidates: [],
      configuredCount: 2,
      missingMappingCount: 0
    });

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request(
      'http://localhost/dev/provision-stripe-prices',
      { method: 'POST' },
      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updated_count).toBe(0);
    expect(json.skipped_already_configured_count).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports missing mapping count', async () => {
    const app = new Hono();
    app.route('/dev', dev);

    const mockDb = createMockDb({
      candidates: [],
      configuredCount: 0,
      missingMappingCount: 3
    });

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request(
      'http://localhost/dev/provision-stripe-prices',
      { method: 'POST' },
      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.skipped_missing_mapping_count).toBe(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
