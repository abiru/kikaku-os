import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateStripeEvidence } from '../../services/stripeEvidence';
import type { Env } from '../../env';

const createMockEnv = () => {
  const mockAll = vi.fn();
  const mockBind = vi.fn(() => ({
    all: mockAll
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    all: mockAll
  }));

  return {
    DB: {
      prepare: mockPrepare,
      _mocks: { mockAll, mockBind, mockPrepare }
    },
    R2: {} as any,
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    ADMIN_API_KEY: 'admin_key',
    STOREFRONT_BASE_URL: 'http://localhost:4321',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    DEV_MODE: 'false'
  } as unknown as Env['Bindings'] & { DB: { _mocks: any } };
};

describe('stripeEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateStripeEvidence', () => {
    it('should fetch payments and refunds for a given date', async () => {
      const env = createMockEnv();

      const mockPayments = [
        {
          id: 1,
          amount: 10000,
          fee: 290,
          created_at: '2026-02-15 10:30:00',
          method: 'card',
          provider: 'stripe'
        },
        {
          id: 2,
          amount: 5000,
          fee: 145,
          created_at: '2026-02-15 14:20:00',
          method: 'jp_bank_transfer',
          provider: 'stripe'
        }
      ];

      const mockRefunds = [
        {
          id: 1,
          amount: 3000,
          created_at: '2026-02-15 16:00:00',
          reason: 'requested_by_customer'
        }
      ];

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: mockPayments })
        .mockResolvedValueOnce({ results: mockRefunds });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.payments).toEqual(mockPayments);
      expect(result.refunds).toEqual(mockRefunds);

      // Verify payments query
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("status='succeeded' AND substr(created_at,1,10)=?")
      );
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith('2026-02-15');

      // Verify refunds query
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, amount, created_at, reason FROM refunds")
      );
    });

    it('should return empty arrays if no data for date', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: null })
        .mockResolvedValueOnce({ results: null });

      const result = await generateStripeEvidence(env, '2026-01-01');

      expect(result.payments).toEqual([]);
      expect(result.refunds).toEqual([]);
    });

    it('should only include succeeded payments', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-02-15');

      // Verify query filters by status='succeeded'
      expect(env.DB._mocks.mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("status='succeeded'")
      );
    });

    it('should only include succeeded refunds', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-02-15');

      // Verify refunds query filters by status='succeeded'
      const refundsQuery = env.DB._mocks.mockPrepare.mock.calls.find((call: any[]) =>
        call[0].includes('FROM refunds')
      );
      expect(refundsQuery).toBeDefined();
      expect(refundsQuery[0]).toContain("status='succeeded'");
    });

    it('should filter by exact date (YYYY-MM-DD)', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-12-31');

      // Verify bind called with exact date
      expect(env.DB._mocks.mockBind).toHaveBeenCalledWith('2026-12-31');
      expect(env.DB._mocks.mockBind).toHaveBeenCalledTimes(2);
    });

    it('should order payments by created_at', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-02-15');

      // Verify ORDER BY clause
      const paymentsQuery = env.DB._mocks.mockPrepare.mock.calls.find((call: any[]) =>
        call[0].includes('FROM payments')
      );
      expect(paymentsQuery).toBeDefined();
      expect(paymentsQuery[0]).toContain('ORDER BY created_at');
    });

    it('should order refunds by created_at', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-02-15');

      // Verify ORDER BY clause
      const refundsQuery = env.DB._mocks.mockPrepare.mock.calls.find((call: any[]) =>
        call[0].includes('FROM refunds')
      );
      expect(refundsQuery).toBeDefined();
      expect(refundsQuery[0]).toContain('ORDER BY created_at');
    });

    it('should include all required payment fields', async () => {
      const env = createMockEnv();

      const payment = {
        id: 100,
        amount: 15000,
        fee: 435,
        created_at: '2026-02-15 12:00:00',
        method: 'card',
        provider: 'stripe'
      };

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [payment] })
        .mockResolvedValueOnce({ results: [] });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.payments[0]).toMatchObject({
        id: 100,
        amount: 15000,
        fee: 435,
        created_at: '2026-02-15 12:00:00',
        method: 'card',
        provider: 'stripe'
      });
    });

    it('should include all required refund fields', async () => {
      const env = createMockEnv();

      const refund = {
        id: 50,
        amount: 5000,
        created_at: '2026-02-15 18:00:00',
        reason: 'duplicate'
      };

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [refund] });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.refunds[0]).toMatchObject({
        id: 50,
        amount: 5000,
        created_at: '2026-02-15 18:00:00',
        reason: 'duplicate'
      });
    });

    it('should handle null payment method and provider', async () => {
      const env = createMockEnv();

      const payment = {
        id: 200,
        amount: 20000,
        fee: 580,
        created_at: '2026-02-15 09:00:00',
        method: null,
        provider: null
      };

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [payment] })
        .mockResolvedValueOnce({ results: [] });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.payments[0].method).toBeNull();
      expect(result.payments[0].provider).toBeNull();
    });

    it('should handle null refund reason', async () => {
      const env = createMockEnv();

      const refund = {
        id: 60,
        amount: 2000,
        created_at: '2026-02-15 20:00:00',
        reason: null
      };

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [refund] });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.refunds[0].reason).toBeNull();
    });

    it('should handle multiple payments and refunds', async () => {
      const env = createMockEnv();

      const payments = [
        { id: 1, amount: 5000, fee: 145, created_at: '2026-02-15 10:00:00', method: 'card', provider: 'stripe' },
        { id: 2, amount: 7000, fee: 203, created_at: '2026-02-15 11:00:00', method: 'card', provider: 'stripe' },
        { id: 3, amount: 3000, fee: 87, created_at: '2026-02-15 12:00:00', method: 'jp_bank_transfer', provider: 'stripe' }
      ];

      const refunds = [
        { id: 1, amount: 1000, created_at: '2026-02-15 15:00:00', reason: 'requested_by_customer' },
        { id: 2, amount: 2000, created_at: '2026-02-15 16:00:00', reason: 'duplicate' }
      ];

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: payments })
        .mockResolvedValueOnce({ results: refunds });

      const result = await generateStripeEvidence(env, '2026-02-15');

      expect(result.payments).toHaveLength(3);
      expect(result.refunds).toHaveLength(2);
    });

    it('should use substr() for date filtering (SQLite compatible)', async () => {
      const env = createMockEnv();

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await generateStripeEvidence(env, '2026-02-15');

      // Verify both queries use substr(created_at,1,10)
      const paymentsQuery = env.DB._mocks.mockPrepare.mock.calls[0][0];
      expect(paymentsQuery).toContain('substr(created_at,1,10)=?');

      const refundsQuery = env.DB._mocks.mockPrepare.mock.calls[1][0];
      expect(refundsQuery).toContain('substr(created_at,1,10)=?');
    });

    it('should be suitable for dispute evidence generation', async () => {
      const env = createMockEnv();

      const payments = [
        { id: 1, amount: 10000, fee: 290, created_at: '2026-02-15 10:00:00', method: 'card', provider: 'stripe' }
      ];

      const refunds = [
        { id: 1, amount: 3000, created_at: '2026-02-15 18:00:00', reason: 'requested_by_customer' }
      ];

      env.DB._mocks.mockAll
        .mockResolvedValueOnce({ results: payments })
        .mockResolvedValueOnce({ results: refunds });

      const result = await generateStripeEvidence(env, '2026-02-15');

      // Evidence should be suitable for Stripe dispute API
      expect(result).toHaveProperty('payments');
      expect(result).toHaveProperty('refunds');
      expect(result.payments[0]).toHaveProperty('id');
      expect(result.payments[0]).toHaveProperty('amount');
      expect(result.payments[0]).toHaveProperty('fee');
      expect(result.payments[0]).toHaveProperty('created_at');
      expect(result.refunds[0]).toHaveProperty('id');
      expect(result.refunds[0]).toHaveProperty('amount');
      expect(result.refunds[0]).toHaveProperty('created_at');
    });
  });
});
