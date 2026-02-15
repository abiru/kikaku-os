import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateCoupon, type CouponRow } from '../../services/coupon';
import type { D1Database } from '@cloudflare/workers-types';

const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockBind = vi.fn(() => ({
    first: mockFirst
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst
  }));

  return {
    prepare: mockPrepare,
    _mocks: { mockFirst, mockBind, mockPrepare }
  } as unknown as D1Database & { _mocks: any };
};

describe('coupon service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset system time
    vi.useRealTimers();
  });

  describe('validateCoupon - invalid code', () => {
    it('should reject non-existent coupon code', async () => {
      const mockDb = createMockDb();
      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      const result = await validateCoupon(mockDb, 'INVALID', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Invalid coupon code');
      }
      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith('INVALID');
    });

    it('should normalize coupon code to uppercase', async () => {
      const mockDb = createMockDb();
      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      await validateCoupon(mockDb, 'lowercase', 1000);

      expect(mockDb._mocks.mockBind).toHaveBeenCalledWith('LOWERCASE');
    });

    it('should reject inactive coupon', async () => {
      const mockDb = createMockDb();
      // Since we only select WHERE status = 'active', inactive coupon returns null
      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      const result = await validateCoupon(mockDb, 'INACTIVE', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Invalid coupon code');
      }
    });
  });

  describe('validateCoupon - date validation', () => {
    it('should reject coupon that has not started yet', async () => {
      const mockDb = createMockDb();
      const futureStartCoupon: CouponRow = {
        id: 2,
        code: 'FUTURE',
        type: 'percentage',
        value: 20,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: '2030-01-01 00:00:00',
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(futureStartCoupon);

      const result = await validateCoupon(mockDb, 'FUTURE', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Coupon not yet valid');
      }
    });

    it('should reject expired coupon (CRITICAL)', async () => {
      const mockDb = createMockDb();
      const expiredCoupon: CouponRow = {
        id: 3,
        code: 'EXPIRED',
        type: 'percentage',
        value: 50,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: '2020-01-01 00:00:00',
        expires_at: '2020-12-31 23:59:59'
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(expiredCoupon);

      const result = await validateCoupon(mockDb, 'EXPIRED', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Coupon has expired');
      }
    });

    it('should accept coupon within valid date range', async () => {
      const mockDb = createMockDb();
      const validCoupon: CouponRow = {
        id: 4,
        code: 'VALID',
        type: 'percentage',
        value: 10,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: '2020-01-01 00:00:00',
        expires_at: '2030-12-31 23:59:59'
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(validCoupon);

      const result = await validateCoupon(mockDb, 'VALID', 1000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.code).toBe('VALID');
        expect(result.coupon.discountAmount).toBe(100); // 10% of 1000
      }
    });

    it('should accept coupon with no date restrictions', async () => {
      const mockDb = createMockDb();
      const noDateCoupon: CouponRow = {
        id: 5,
        code: 'NODATE',
        type: 'fixed',
        value: 500,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(noDateCoupon);

      const result = await validateCoupon(mockDb, 'NODATE', 2000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(500);
      }
    });
  });

  describe('validateCoupon - usage limits (CRITICAL)', () => {
    it('should reject coupon that reached max uses', async () => {
      const mockDb = createMockDb();
      const maxUsedCoupon: CouponRow = {
        id: 6,
        code: 'MAXED',
        type: 'percentage',
        value: 25,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: 100,
        current_uses: 100,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(maxUsedCoupon);

      const result = await validateCoupon(mockDb, 'MAXED', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Coupon usage limit reached');
      }
    });

    it('should reject coupon that exceeded max uses', async () => {
      const mockDb = createMockDb();
      const overUsedCoupon: CouponRow = {
        id: 7,
        code: 'OVERUSED',
        type: 'percentage',
        value: 15,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: 50,
        current_uses: 75,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(overUsedCoupon);

      const result = await validateCoupon(mockDb, 'OVERUSED', 1000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toBe('Coupon usage limit reached');
      }
    });

    it('should accept coupon with usage below limit', async () => {
      const mockDb = createMockDb();
      const underLimitCoupon: CouponRow = {
        id: 8,
        code: 'AVAILABLE',
        type: 'percentage',
        value: 20,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: 100,
        current_uses: 50,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(underLimitCoupon);

      const result = await validateCoupon(mockDb, 'AVAILABLE', 1000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.code).toBe('AVAILABLE');
        expect(result.coupon.discountAmount).toBe(200); // 20% of 1000
      }
    });

    it('should accept coupon with no usage limit', async () => {
      const mockDb = createMockDb();
      const unlimitedCoupon: CouponRow = {
        id: 9,
        code: 'UNLIMITED',
        type: 'percentage',
        value: 5,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 999,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(unlimitedCoupon);

      const result = await validateCoupon(mockDb, 'UNLIMITED', 1000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(50); // 5% of 1000
      }
    });
  });

  describe('validateCoupon - minimum order amount (revenue protection)', () => {
    it('should reject coupon when cart total below minimum', async () => {
      const mockDb = createMockDb();
      const minOrderCoupon: CouponRow = {
        id: 10,
        code: 'BIGORDER',
        type: 'percentage',
        value: 30,
        currency: 'JPY',
        min_order_amount: 10000,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(minOrderCoupon);

      const result = await validateCoupon(mockDb, 'BIGORDER', 5000);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain('Minimum purchase of ¥10,000');
      }
    });

    it('should accept coupon when cart total meets minimum', async () => {
      const mockDb = createMockDb();
      const minOrderCoupon: CouponRow = {
        id: 11,
        code: 'BIGORDER2',
        type: 'percentage',
        value: 20,
        currency: 'JPY',
        min_order_amount: 10000,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(minOrderCoupon);

      const result = await validateCoupon(mockDb, 'BIGORDER2', 10000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(2000); // 20% of 10000
      }
    });

    it('should accept coupon when cart total exceeds minimum', async () => {
      const mockDb = createMockDb();
      const minOrderCoupon: CouponRow = {
        id: 12,
        code: 'BIGORDER3',
        type: 'fixed',
        value: 1000,
        currency: 'JPY',
        min_order_amount: 5000,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(minOrderCoupon);

      const result = await validateCoupon(mockDb, 'BIGORDER3', 15000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(1000);
      }
    });

    it('should handle zero minimum order amount', async () => {
      const mockDb = createMockDb();
      const zeroMinCoupon: CouponRow = {
        id: 13,
        code: 'ZEROMIN',
        type: 'percentage',
        value: 10,
        currency: 'JPY',
        min_order_amount: 0,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(zeroMinCoupon);

      const result = await validateCoupon(mockDb, 'ZEROMIN', 100);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(10);
      }
    });
  });

  describe('validateCoupon - discount calculation', () => {
    it('should calculate percentage discount correctly', async () => {
      const mockDb = createMockDb();
      const percentageCoupon: CouponRow = {
        id: 14,
        code: 'PERCENT25',
        type: 'percentage',
        value: 25,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(percentageCoupon);

      const result = await validateCoupon(mockDb, 'PERCENT25', 8000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountType).toBe('percentage');
        expect(result.coupon.discountValue).toBe(25);
        // 8000 * 25 / 100 = 2000
        expect(result.coupon.discountAmount).toBe(2000);
      }
    });

    it('should floor percentage discount (no rounding up)', async () => {
      const mockDb = createMockDb();
      const percentageCoupon: CouponRow = {
        id: 15,
        code: 'PERCENT15',
        type: 'percentage',
        value: 15,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(percentageCoupon);

      const result = await validateCoupon(mockDb, 'PERCENT15', 1003);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // 1003 * 15 / 100 = 150.45 -> floor to 150
        expect(result.coupon.discountAmount).toBe(150);
      }
    });

    it('should calculate fixed discount correctly', async () => {
      const mockDb = createMockDb();
      const fixedCoupon: CouponRow = {
        id: 16,
        code: 'FIXED500',
        type: 'fixed',
        value: 500,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(fixedCoupon);

      const result = await validateCoupon(mockDb, 'FIXED500', 3000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountType).toBe('fixed');
        expect(result.coupon.discountValue).toBe(500);
        expect(result.coupon.discountAmount).toBe(500);
      }
    });

    it('should cap fixed discount at cart total (prevent negative)', async () => {
      const mockDb = createMockDb();
      const largeCoupon: CouponRow = {
        id: 17,
        code: 'HUGE',
        type: 'fixed',
        value: 10000,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(largeCoupon);

      const result = await validateCoupon(mockDb, 'HUGE', 1000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // Should cap at cart total to prevent negative
        expect(result.coupon.discountAmount).toBe(1000);
      }
    });

    it('should handle 100% discount', async () => {
      const mockDb = createMockDb();
      const fullCoupon: CouponRow = {
        id: 18,
        code: 'FREE',
        type: 'percentage',
        value: 100,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(fullCoupon);

      const result = await validateCoupon(mockDb, 'FREE', 5000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(5000);
      }
    });
  });

  describe('validateCoupon - edge cases', () => {
    it('should handle zero cart total', async () => {
      const mockDb = createMockDb();
      const coupon: CouponRow = {
        id: 19,
        code: 'ZEROCART',
        type: 'percentage',
        value: 50,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(coupon);

      const result = await validateCoupon(mockDb, 'ZEROCART', 0);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon.discountAmount).toBe(0);
      }
    });

    it('should return all required fields in success response', async () => {
      const mockDb = createMockDb();
      const coupon: CouponRow = {
        id: 20,
        code: 'COMPLETE',
        type: 'percentage',
        value: 15,
        currency: 'JPY',
        min_order_amount: null,
        max_uses: null,
        current_uses: 0,
        status: 'active',
        starts_at: null,
        expires_at: null
      };
      mockDb._mocks.mockFirst.mockResolvedValueOnce(coupon);

      const result = await validateCoupon(mockDb, 'COMPLETE', 2000);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.coupon).toHaveProperty('id');
        expect(result.coupon).toHaveProperty('code');
        expect(result.coupon).toHaveProperty('discountType');
        expect(result.coupon).toHaveProperty('discountValue');
        expect(result.coupon).toHaveProperty('discountAmount');
        expect(result.coupon.id).toBe(20);
        expect(result.coupon.code).toBe('COMPLETE');
      }
    });
  });
});
