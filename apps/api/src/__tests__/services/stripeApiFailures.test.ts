import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureStripeProduct,
  ensureStripePrice,
  ensureStripePriceForVariant,
} from '../../services/stripe';
import { provisionStripePrices } from '../../services/stripeProvision';

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
  } as unknown as D1Database & { _mocks: any };
};

const originalFetch = global.fetch;

describe('Stripe API failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('ensureStripeProduct - API failures', () => {
    it('should throw on 400 Bad Request', async () => {
      const db = createMockDb();
      const product = {
        id: 1,
        title: 'Bad Product',
        description: null,
        provider_product_id: null,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid product name',
      });

      await expect(
        ensureStripeProduct(db, 'sk_test_xxx', product)
      ).rejects.toThrow('Stripe API error');
    });

    it('should throw on 500 Internal Server Error', async () => {
      const db = createMockDb();
      const product = {
        id: 2,
        title: 'Server Error Product',
        description: null,
        provider_product_id: null,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(
        ensureStripeProduct(db, 'sk_test_xxx', product)
      ).rejects.toThrow('Stripe API error');
    });

    it('should throw on 401 Unauthorized', async () => {
      const db = createMockDb();
      const product = {
        id: 3,
        title: 'Unauthorized Product',
        description: null,
        provider_product_id: null,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API Key',
      });

      await expect(
        ensureStripeProduct(db, 'sk_invalid', product)
      ).rejects.toThrow('Stripe API error');
    });

    it('should throw on 429 Rate Limit', async () => {
      const db = createMockDb();
      const product = {
        id: 4,
        title: 'Rate Limited Product',
        description: null,
        provider_product_id: null,
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too many requests',
      });

      await expect(
        ensureStripeProduct(db, 'sk_test_xxx', product)
      ).rejects.toThrow('Stripe API error');
    });

    it('should handle network timeout (fetch rejection)', async () => {
      const db = createMockDb();
      const product = {
        id: 5,
        title: 'Timeout Product',
        description: null,
        provider_product_id: null,
      };

      global.fetch = vi.fn().mockRejectedValueOnce(new Error('network timeout'));

      await expect(
        ensureStripeProduct(db, 'sk_test_xxx', product)
      ).rejects.toThrow('network timeout');
    });
  });

  describe('ensureStripePrice - API failures', () => {
    it('should throw on price creation 400 error', async () => {
      const db = createMockDb();
      const variant = {
        variant_id: 1,
        variant_title: 'Default',
        product_id: 1,
        product_title: 'Product',
        price_id: 1,
        amount: 0, // Invalid amount
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: 'prod_123',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Amount must be positive',
      });

      await expect(
        ensureStripePrice(db, 'sk_test_xxx', variant, 'prod_stripe')
      ).rejects.toThrow();
    });

    it('should throw on price creation 500 error', async () => {
      const db = createMockDb();
      const variant = {
        variant_id: 2,
        variant_title: 'Large',
        product_id: 1,
        product_title: 'Product',
        price_id: 2,
        amount: 2000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: 'prod_123',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Stripe internal error',
      });

      await expect(
        ensureStripePrice(db, 'sk_test_xxx', variant, 'prod_stripe')
      ).rejects.toThrow();
    });

    it('should handle network error during price creation', async () => {
      const db = createMockDb();
      const variant = {
        variant_id: 3,
        variant_title: 'Medium',
        product_id: 1,
        product_title: 'Product',
        price_id: 3,
        amount: 1500,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: 'prod_123',
      };

      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Connection refused')
      );

      await expect(
        ensureStripePrice(db, 'sk_test_xxx', variant, 'prod_stripe')
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('ensureStripePriceForVariant - cascading failures', () => {
    it('should throw when product creation fails in the chain', async () => {
      const db = createMockDb();
      const variant = {
        variant_id: 1,
        variant_title: 'Small',
        product_id: 1,
        product_title: 'Shirt',
        price_id: 1,
        amount: 3000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: null,
      };

      const product = {
        id: 1,
        title: 'Shirt',
        description: null,
        provider_product_id: null,
      };

      db._mocks.mockFirst.mockResolvedValueOnce(product);

      // Product creation fails
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service temporarily unavailable',
      });

      await expect(
        ensureStripePriceForVariant(db, 'sk_test_xxx', variant)
      ).rejects.toThrow();
    });

    it('should throw when product succeeds but price creation fails', async () => {
      const db = createMockDb();
      const variant = {
        variant_id: 2,
        variant_title: 'Medium',
        product_id: 2,
        product_title: 'Hat',
        price_id: 2,
        amount: 5000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: null,
      };

      const product = {
        id: 2,
        title: 'Hat',
        description: null,
        provider_product_id: null,
      };

      db._mocks.mockFirst.mockResolvedValueOnce(product);
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'prod_hat', object: 'product' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Invalid price params',
        });

      await expect(
        ensureStripePriceForVariant(db, 'sk_test_xxx', variant)
      ).rejects.toThrow();
    });
  });

  describe('provisionStripePrices - batch failure handling', () => {
    it('should handle multiple consecutive API failures', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            { variant_id: 1, variant_title: 'A', product_id: 10, product_title: 'P1', price_id: 100, amount: 1000, currency: 'JPY' },
            { variant_id: 2, variant_title: 'B', product_id: 20, product_title: 'P2', price_id: 200, amount: 2000, currency: 'JPY' },
            { variant_id: 3, variant_title: 'C', product_id: 30, product_title: 'P3', price_id: 300, amount: 3000, currency: 'JPY' },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      // All three search calls fail with different errors
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Server error' } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'Rate limited' } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Unauthorized' } }),
        });

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(3);
      expect(result.errors[0].message).toBe('Server error');
      expect(result.errors[1].message).toBe('Rate limited');
      expect(result.errors[2].message).toBe('Unauthorized');
    });

    it('should handle mixed success and failure in batch', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            { variant_id: 1, variant_title: 'A', product_id: 10, product_title: 'P1', price_id: 100, amount: 1000, currency: 'JPY' },
            { variant_id: 2, variant_title: 'B', product_id: 20, product_title: 'P2', price_id: 200, amount: 2000, currency: 'JPY' },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });
      db._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn()
        // First variant: search fails
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Temporary outage' } }),
        })
        // Second variant: search + price both succeed
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
    });

    it('should handle fetch throwing (network timeout) in batch', async () => {
      const db = createMockDb();

      db._mocks.mockAll
        .mockResolvedValueOnce({
          results: [
            { variant_id: 1, variant_title: 'A', product_id: 10, product_title: 'P1', price_id: 100, amount: 1000, currency: 'JPY' },
          ],
        })
        .mockResolvedValueOnce({ results: [] });

      db._mocks.mockFirst.mockResolvedValueOnce({ count: 0 });

      global.fetch = vi.fn().mockRejectedValueOnce(
        new Error('Request timed out after 30000ms')
      );

      const result = await provisionStripePrices(db, 'sk_test_xxx');

      expect(result.updated_count).toBe(0);
      expect(result.errors_count).toBe(1);
      expect(result.errors[0].message).toBe('Unexpected error provisioning Stripe price');
    });
  });
});
