import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provisionStripePrices, type ProvisionResult } from '../../services/stripeProvision';

const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();
  const mockAll = vi.fn();
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    run: mockRun,
    all: mockAll,
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst,
    run: mockRun,
    all: mockAll,
  }));

  return {
    prepare: mockPrepare,
    _mocks: { mockFirst, mockRun, mockAll, mockBind, mockPrepare },
  } as unknown as D1Database & { _mocks: ReturnType<typeof createMockDb>['_mocks'] };
};

const originalFetch = global.fetch;

describe('stripeProvision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('provisionStripePrices', () => {
    it('should return zero counts when no rows need provisioning', async () => {
      const db = createMockDb();

      // Query 1: rows needing provisioning (empty)
      db._mocks.mockAll.mockResolvedValueOnce({ results: [] });
      // Query 2: already configured count
      db._mocks.mockFirst.mockResolvedValueOnce({ count: 5 });
      // Query 3: missing mapping
      db._mocks.mockAll.mockResolvedValueOnce({ results: [] });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result).toEqual({
        updated_count: 0,
        skipped_already_configured_count: 5,
        skipped_missing_mapping_count: 0,
        errors_count: 0,
        errors: [],
      });
    });

    it('should provision a single variant via search + price create', async () => {
      const db = createMockDb();

      // Query 1: rows needing provisioning
      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 1,
              variant_title: 'Default',
              product_id: 10,
              product_title: 'T-Shirt',
              price_id: 100,
              amount: 2000,
              currency: 'JPY',
            },
          ],
        })
        // Query 3: missing mapping
        .mockResolvedValueOnce({ results: [] });

      // Query 2: already configured count
      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // DB update for price
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      // Stripe search → found existing product
      // Stripe price create → success
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_existing_1' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_new_1' }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(1);
      expect(result.errors_count).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Verify search call
      const searchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(searchCall[0]).toContain('products/search');
      expect(searchCall[1].headers.authorization).toBe('Bearer sk_test_xxx');

      // Verify price create call
      const priceCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(priceCall[0]).toBe('https://api.stripe.com/v1/prices');
      const body = priceCall[1].body as string;
      expect(body).toContain('unit_amount=2000');
      expect(body).toContain('currency=jpy');
      expect(body).toContain('product=prod_existing_1');
    });

    it('should create product when search returns no results', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 2,
              variant_title: 'Large',
              product_id: 20,
              product_title: 'Hoodie',
              price_id: 200,
              amount: 5000,
              currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      // search → empty, create product → success, create price → success
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'prod_new_2' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_new_2' }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(1);
      expect(result.errors_count).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Verify product create
      const productCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(productCall[0]).toBe('https://api.stripe.com/v1/products');
      const productBody = productCall[1].body as string;
      expect(productBody).toContain('name=Hoodie+-+Large');
      expect(productBody).toContain('metadata%5Bvariant_id%5D=2');
      expect(productBody).toContain('metadata%5Bproduct_id%5D=20');
    });

    it('should accumulate errors without stopping batch', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 1, variant_title: 'A', product_id: 10,
              product_title: 'P1', price_id: 100, amount: 1000, currency: 'JPY',
            },
            {
              variant_id: 2, variant_title: 'B', product_id: 20,
              product_title: 'P2', price_id: 200, amount: 2000, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      // First variant: search fails with 500
      // Second variant: search succeeds, price create succeeds
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal Server Error' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_2' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_2' }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(1);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0]).toEqual({
        price_id: 100,
        variant_id: 1,
        message: 'Internal Server Error',
      });
    });

    it('should use product cache for same variant_id', async () => {
      const db = createMockDb();

      // Two rows with same variant_id
      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 1, variant_title: 'A', product_id: 10,
              product_title: 'P1', price_id: 100, amount: 1000, currency: 'JPY',
            },
            {
              variant_id: 1, variant_title: 'A', product_id: 10,
              product_title: 'P1', price_id: 101, amount: 1500, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });
      db._mocks.mockRun
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      // First: search + price create
      // Second: cached product, only price create
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_cached' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_2' }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(2);
      // Only 1 search + 2 price creates = 3 calls (not 2 searches)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should record error when product create fails', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 3, variant_title: 'S', product_id: 30,
              product_title: 'Cap', price_id: 300, amount: 3000, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // search → empty, create product → 400 error
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid params' } }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Invalid params');
    });

    it('should record error when price create fails', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 4, variant_title: 'M', product_id: 40,
              product_title: 'Bag', price_id: 400, amount: 4000, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // search → found product, price create → 400
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_4' }] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Amount too low' } }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Amount too low');
    });

    it('should record error when price response missing id', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 5, variant_title: 'L', product_id: 50,
              product_title: 'Socks', price_id: 500, amount: 500, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_5' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}), // missing id
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Stripe price response missing id');
    });

    it('should catch unexpected errors and continue', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 6, variant_title: 'XL', product_id: 60,
              product_title: 'Jacket', price_id: 600, amount: 10000, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // search throws network error
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Unexpected error provisioning Stripe price');
    });

    it('should report missing mapping count', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [{ variant_id: 10 }, { variant_id: 11 }] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 3 });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.skipped_already_configured_count).toBe(3);
      expect(result.skipped_missing_mapping_count).toBe(2);
    });

    it('should default currency to JPY when empty', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 7, variant_title: 'Def', product_id: 70,
              product_title: 'Widget', price_id: 700, amount: 100, currency: '',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'prod_7' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_7' }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(1);
      const priceCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      const body = priceCall[1].body as string;
      expect(body).toContain('currency=jpy');
    });

    it('should handle error JSON parse failure gracefully', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 8, variant_title: 'X', product_id: 80,
              product_title: 'Thing', price_id: 800, amount: 999, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // search fails and json() also fails
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new Error('not JSON'); },
      });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toContain('status 502');
    });

    it('should record error when product id is missing after create', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            {
              variant_id: 9, variant_title: 'Y', product_id: 90,
              product_title: 'Gizmo', price_id: 900, amount: 800, currency: 'JPY',
            },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // search → empty, create product → missing id
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}), // missing product id
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Stripe product not available for price provisioning');
    });
  });
});
