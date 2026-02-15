import type { D1Database } from '@cloudflare/workers-types';

export interface CouponRow {
  id: number;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  currency: string;
  min_order_amount: number | null;
  max_uses: number | null;
  current_uses: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
}

export interface CouponValidationSuccess {
  valid: true;
  coupon: {
    id: number;
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
  };
}

export interface CouponValidationFailure {
  valid: false;
  message: string;
}

export type CouponValidationResult = CouponValidationSuccess | CouponValidationFailure;

/**
 * Validate a coupon code and calculate discount amount.
 * Shared between /checkout/validate-coupon and /checkout/quote endpoints.
 */
export const validateCoupon = async (
  db: D1Database,
  code: string,
  cartTotal: number
): Promise<CouponValidationResult> => {
  const coupon = await db.prepare(
    `SELECT id, code, type, value, currency, min_order_amount,
            max_uses, current_uses, status, starts_at, expires_at
     FROM coupons
     WHERE code = ? AND status = 'active'`
  ).bind(code.toUpperCase()).first<CouponRow>();

  if (!coupon) {
    return { valid: false, message: 'Invalid coupon code' };
  }

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) {
    return { valid: false, message: 'Coupon not yet valid' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { valid: false, message: 'Coupon has expired' };
  }

  if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }

  if (coupon.min_order_amount !== null && coupon.min_order_amount > 0 && cartTotal < coupon.min_order_amount) {
    return {
      valid: false,
      message: `Minimum purchase of ¥${coupon.min_order_amount.toLocaleString()} required`
    };
  }

  let discountAmount = 0;
  if (coupon.type === 'percentage') {
    discountAmount = Math.floor((cartTotal * coupon.value) / 100);
  } else {
    discountAmount = Math.min(coupon.value, cartTotal);
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.type,
      discountValue: coupon.value,
      discountAmount
    }
  };
};
