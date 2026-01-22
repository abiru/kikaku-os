import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ensureStripeCustomer, type CustomerInfo } from './stripeCustomer';
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

// Mock D1 database
const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    run: mockRun,
    bind: vi.fn()
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

// Mock fetch globally
const originalFetch = global.fetch;

describe('stripeCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  describe('ensureStripeCustomer', () => {
    it('should return existing stripe_customer_id if already set (idempotent)', async () => {
      const mockDb = createMockDb();
      const existingCustomer: CustomerInfo = {
        id: 1,
        email: 'test@example.com',
        stripe_customer_id: 'cus_existing123'
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(existingCustomer);

      // Mock fetch as a spy (even though we expect it not to be called)
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      const result = await ensureStripeCustomer(
        mockDb,
        'sk_test_xxx',
        1,
        'test@example.com'
      );

      expect(result).toBe('cus_existing123');
      expect(mockDb._mocks.mockPrepare).toHaveBeenCalledWith(
        'SELECT id, email, stripe_customer_id FROM customers WHERE id = ?'
      );
      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith(1);
      // Should NOT create new Stripe Customer or update DB
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should throw error if customer not found in database', async () => {
      const mockDb = createMockDb();
      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      await expect(
        ensureStripeCustomer(mockDb, 'sk_test_xxx', 999, 'test@example.com')
      ).rejects.toThrow('Customer 999 not found');
    });

    it('should create Stripe Customer if stripe_customer_id is null', async () => {
      const mockDb = createMockDb();
      const customerWithoutStripeId: CustomerInfo = {
        id: 1,
        email: 'test@example.com',
        stripe_customer_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customerWithoutStripeId);
      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      // Mock Stripe API response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_new123', object: 'customer' })
      });

      const result = await ensureStripeCustomer(
        mockDb,
        'sk_test_secret',
        1,
        'test@example.com'
      );

      expect(result).toBe('cus_new123');

      // Verify Stripe API call
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/customers',
        expect.objectContaining({
          method: 'POST',
          headers: {
            authorization: 'Bearer sk_test_secret',
            'content-type': 'application/x-www-form-urlencoded'
          }
        })
      );

      // Verify body contains email and metadata
      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('email=test%40example.com');
      expect(body).toContain('metadata%5Blocal_customer_id%5D=1');

      // Verify database update
      expect(mockDb._mocks.mockPrepare).toHaveBeenCalledWith(
        'UPDATE customers SET stripe_customer_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
      );
      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith('cus_new123', 1);
      expect(mockDb._mocks.mockRun).toHaveBeenCalled();
    });

    it('should create Stripe Customer without email if email is null', async () => {
      const mockDb = createMockDb();
      const customerWithoutEmail: CustomerInfo = {
        id: 2,
        email: null,
        stripe_customer_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customerWithoutEmail);
      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_noemail456', object: 'customer' })
      });

      const result = await ensureStripeCustomer(mockDb, 'sk_test_xxx', 2, null);

      expect(result).toBe('cus_noemail456');

      // Verify email not in request body
      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).not.toContain('email');
      expect(body).toContain('metadata%5Blocal_customer_id%5D=2');
    });

    it('should throw error if Stripe API fails', async () => {
      const mockDb = createMockDb();
      const customer: CustomerInfo = {
        id: 1,
        email: 'test@example.com',
        stripe_customer_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customer);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API Key'
      });

      await expect(
        ensureStripeCustomer(mockDb, 'sk_invalid', 1, 'test@example.com')
      ).rejects.toThrow('Failed to create Stripe Customer: Invalid API Key');
    });

    it('should handle multiple calls for same customer (idempotency test)', async () => {
      const mockDb = createMockDb();

      // First call: no stripe_customer_id, creates new
      const customerBefore: CustomerInfo = {
        id: 1,
        email: 'test@example.com',
        stripe_customer_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customerBefore);
      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_idempotent789', object: 'customer' })
      });

      const firstResult = await ensureStripeCustomer(
        mockDb,
        'sk_test_xxx',
        1,
        'test@example.com'
      );

      expect(firstResult).toBe('cus_idempotent789');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call: stripe_customer_id now exists, returns immediately
      const customerAfter: CustomerInfo = {
        id: 1,
        email: 'test@example.com',
        stripe_customer_id: 'cus_idempotent789'
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customerAfter);

      const secondResult = await ensureStripeCustomer(
        mockDb,
        'sk_test_xxx',
        1,
        'test@example.com'
      );

      expect(secondResult).toBe('cus_idempotent789');
      // Fetch should still only have been called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should store local_customer_id in Stripe metadata for reconciliation', async () => {
      const mockDb = createMockDb();
      const customer: CustomerInfo = {
        id: 42,
        email: 'reconcile@example.com',
        stripe_customer_id: null
      };

      mockDb._mocks.mockFirst.mockResolvedValueOnce(customer);
      mockDb._mocks.mockRun.mockResolvedValueOnce({ success: true });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_meta999', object: 'customer' })
      });

      await ensureStripeCustomer(mockDb, 'sk_test_xxx', 42, 'reconcile@example.com');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = fetchCall[1].body as string;

      // Verify metadata contains local_customer_id=42
      expect(body).toContain('metadata%5Blocal_customer_id%5D=42');
    });
  });
});
