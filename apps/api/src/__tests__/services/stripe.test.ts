import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureStripeProduct,
  ensureStripePrice,
  ensureStripePriceForVariant
} from '../../services/stripe';
import type { D1Database } from '@cloudflare/workers-types';

const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    run: mockRun
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst,
    run: mockRun
  }));

  return {
    prepare: mockPrepare,
    _mocks: { mockFirst, mockRun, mockBind, mockPrepare }
  } as unknown as D1Database & { _mocks: any };
};

const originalFetch = global.fetch;

describe('stripe service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('ensureStripeProduct', () => {
    it('should return existing provider_product_id if already set', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 1,
        title: 'Test Product',
        description: null,
        provider_product_id: 'prod_existing123'
      };

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await ensureStripeProduct(mockDb, 'sk_test_xxx', product);

      expect(result).toBe('prod_existing123');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should create new Stripe product if provider_product_id is null', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 1,
        title: 'New Product',
        description: '<p>Test description</p>',
        provider_product_id: null
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod_new456', object: 'product' })
      });

      const result = await ensureStripeProduct(mockDb, 'sk_test_key', product);

      expect(result).toBe('prod_new456');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/products',
        expect.objectContaining({
          method: 'POST',
          headers: {
            authorization: 'Bearer sk_test_key',
            'content-type': 'application/x-www-form-urlencoded'
          }
        })
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('name=New+Product');
      expect(body).toContain('description=Test+description');
      expect(body).toContain('metadata%5Blocal_product_id%5D=1');

      expect(mockDb._mocks.mockPrepare).toHaveBeenCalledWith(
        'UPDATE products SET provider_product_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
      );
      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith('prod_new456', 1);
    });

    it('should strip HTML from description before sending to Stripe', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 2,
        title: 'HTML Product',
        description: '<p>This is <strong>bold</strong> and <em>italic</em></p>',
        provider_product_id: null
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod_html789', object: 'product' })
      });

      await ensureStripeProduct(mockDb, 'sk_test_xxx', product);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('description=This+is+bold+and+italic');
      expect(body).not.toContain('<p>');
      expect(body).not.toContain('<strong>');
    });

    it('should truncate description to 500 characters', async () => {
      const mockDb = createMockDb();
      const longDescription = 'A'.repeat(600);
      const product = {
        id: 3,
        title: 'Long Description',
        description: longDescription,
        provider_product_id: null
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod_long', object: 'product' })
      });

      await ensureStripeProduct(mockDb, 'sk_test_xxx', product);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      const descMatch = body.match(/description=([^&]*)/);
      if (descMatch) {
        const desc = decodeURIComponent(descMatch[1]);
        expect(desc.length).toBeLessThanOrEqual(500);
        expect(desc).toContain('...');
      }
    });

    it('should include image URL if provided', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 4,
        title: 'Product with Image',
        description: null,
        provider_product_id: null
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod_img', object: 'product' })
      });

      await ensureStripeProduct(
        mockDb,
        'sk_test_xxx',
        product,
        'https://example.com/image.jpg'
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('images%5B0%5D=https%3A%2F%2Fexample.com%2Fimage.jpg');
    });

    it('should update existing product with image and description if provided', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 5,
        title: 'Existing Product',
        description: '<p>New description</p>',
        provider_product_id: 'prod_existing999'
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'prod_existing999', object: 'product' })
      });

      const result = await ensureStripeProduct(
        mockDb,
        'sk_test_xxx',
        product,
        'https://example.com/new-image.jpg'
      );

      expect(result).toBe('prod_existing999');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/products/prod_existing999',
        expect.objectContaining({ method: 'POST' })
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('images%5B0%5D=https%3A%2F%2Fexample.com%2Fnew-image.jpg');
      expect(body).toContain('description=New+description');
    });

    it('should not update existing product if no image or description', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 6,
        title: 'No Update Needed',
        description: null,
        provider_product_id: 'prod_noupdate'
      };

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await ensureStripeProduct(mockDb, 'sk_test_xxx', product);

      expect(result).toBe('prod_noupdate');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should continue on update failure (non-critical)', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 7,
        title: 'Update Fails',
        description: 'New description',
        provider_product_id: 'prod_fail'
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Product not found'
      });

      const result = await ensureStripeProduct(mockDb, 'sk_test_xxx', product);

      expect(result).toBe('prod_fail');
      expect(global.fetch).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update Stripe product')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should throw error if Stripe API fails on create', async () => {
      const mockDb = createMockDb();
      const product = {
        id: 8,
        title: 'Create Fails',
        description: null,
        provider_product_id: null
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key'
      });

      await expect(
        ensureStripeProduct(mockDb, 'sk_invalid', product)
      ).rejects.toThrow('Stripe API error');
    });
  });

  describe('ensureStripePrice', () => {
    it('should return existing provider_price_id if already set', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 1,
        variant_title: 'Default',
        product_id: 1,
        product_title: 'Test Product',
        price_id: 1,
        amount: 1000,
        currency: 'JPY',
        provider_price_id: 'price_existing123',
        provider_product_id: 'prod_123'
      };

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await ensureStripePrice(
        mockDb,
        'sk_test_xxx',
        variant,
        'prod_stripe_id'
      );

      expect(result).toBe('price_existing123');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should create new Stripe price if provider_price_id is null', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 2,
        variant_title: 'Large',
        product_id: 1,
        product_title: 'T-Shirt',
        price_id: 2,
        amount: 2000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: 'prod_123'
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'price_new456', object: 'price' })
      });

      const result = await ensureStripePrice(
        mockDb,
        'sk_test_key',
        variant,
        'prod_stripe_123'
      );

      expect(result).toBe('price_new456');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/prices',
        expect.objectContaining({
          method: 'POST',
          headers: {
            authorization: 'Bearer sk_test_key',
            'content-type': 'application/x-www-form-urlencoded'
          }
        })
      );

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('product=prod_stripe_123');
      expect(body).toContain('unit_amount=2000');
      expect(body).toContain('currency=jpy');
      expect(body).toContain('nickname=T-Shirt+-+Large');
      expect(body).toContain('metadata%5Blocal_price_id%5D=2');
      expect(body).toContain('metadata%5Blocal_variant_id%5D=2');

      expect(mockDb._mocks.mockPrepare).toHaveBeenCalledWith(
        'UPDATE prices SET provider_price_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
      );
      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith('price_new456', 2);
    });

    it('should handle whitespace in provider_price_id', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 3,
        variant_title: 'Medium',
        product_id: 1,
        product_title: 'Product',
        price_id: 3,
        amount: 1500,
        currency: 'JPY',
        provider_price_id: '  price_whitespace  ',
        provider_product_id: 'prod_123'
      };

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await ensureStripePrice(
        mockDb,
        'sk_test_xxx',
        variant,
        'prod_stripe_id'
      );

      expect(result).toBe('price_whitespace');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('should default currency to JPY if not specified', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 4,
        variant_title: 'Default',
        product_id: 1,
        product_title: 'Product',
        price_id: 4,
        amount: 3000,
        currency: '',
        provider_price_id: null,
        provider_product_id: 'prod_123'
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'price_jpy', object: 'price' })
      });

      await ensureStripePrice(mockDb, 'sk_test_xxx', variant, 'prod_stripe');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('currency=jpy');
    });

    it('should lowercase currency code', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 5,
        variant_title: 'USD Variant',
        product_id: 1,
        product_title: 'Product',
        price_id: 5,
        amount: 10,
        currency: 'USD',
        provider_price_id: null,
        provider_product_id: 'prod_123'
      };

      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'price_usd', object: 'price' })
      });

      await ensureStripePrice(mockDb, 'sk_test_xxx', variant, 'prod_stripe');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('currency=usd');
    });
  });

  describe('ensureStripePriceForVariant', () => {
    it('should create both product and price if needed', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 1,
        variant_title: 'Small',
        product_id: 1,
        product_title: 'Hat',
        price_id: 1,
        amount: 5000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: null
      };

      const product = {
        id: 1,
        title: 'Hat',
        description: 'Nice hat',
        provider_product_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(product);
      mockDb._mocks.mockRun.mockResolvedValue({ success: true });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'prod_hat123', object: 'product' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_hat456', object: 'price' })
        });

      global.fetch = fetchMock as any;

      const result = await ensureStripePriceForVariant(
        mockDb,
        'sk_test_xxx',
        variant
      );

      expect(result).toBe('price_hat456');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error if product not found', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 1,
        variant_title: 'Small',
        product_id: 999,
        product_title: 'Nonexistent',
        price_id: 1,
        amount: 1000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      await expect(
        ensureStripePriceForVariant(mockDb, 'sk_test_xxx', variant)
      ).rejects.toThrow('Product 999 not found');
    });

    it('should include image URL when creating product', async () => {
      const mockDb = createMockDb();
      const variant = {
        variant_id: 2,
        variant_title: 'Medium',
        product_id: 2,
        product_title: 'Shirt',
        price_id: 2,
        amount: 3000,
        currency: 'JPY',
        provider_price_id: null,
        provider_product_id: null
      };

      const product = {
        id: 2,
        title: 'Shirt',
        description: null,
        provider_product_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(product);
      mockDb._mocks.mockRun.mockResolvedValue({ success: true });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'prod_shirt', object: 'product' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'price_shirt', object: 'price' })
        });

      global.fetch = fetchMock as any;

      await ensureStripePriceForVariant(
        mockDb,
        'sk_test_xxx',
        variant,
        'https://example.com/shirt.jpg'
      );

      const productCall = fetchMock.mock.calls[0];
      const productBody = productCall[1].body as string;
      expect(productBody).toContain('images%5B0%5D=https%3A%2F%2Fexample.com%2Fshirt.jpg');
    });
  });
});
