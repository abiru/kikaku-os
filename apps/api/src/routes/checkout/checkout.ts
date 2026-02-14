import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { calculateOrderTax, type TaxCalculationInput } from '../../services/tax';
import { getShippingSettings } from '../../services/settings';
import { checkStockAvailability } from '../../services/inventoryCheck';

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(50),
  cartTotal: z.number().int().min(0),
});

const checkout = new Hono<Env>();

// Generate UUID for quote ID
const generateQuoteId = () => {
  return crypto.randomUUID();
};

checkout.get('/checkout/config', async (c) => {
  const shippingSettings = await getShippingSettings(c.env);
  return jsonOk(c, {
    shippingFee: shippingSettings.shippingFee,
    freeShippingThreshold: shippingSettings.freeShippingThreshold
  });
});

checkout.post('/checkout/validate-coupon', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = validateCouponSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(c, parsed.error.issues[0]?.message || 'Invalid request', 400);
    }

    const { code, cartTotal } = parsed.data;

    const coupon = await c.env.DB.prepare(
      `SELECT id, code, discount_type, discount_value, min_purchase, max_uses, used_count, valid_from, valid_until, active
       FROM coupons
       WHERE code = ? AND active = 1`
    )
      .bind(code.toUpperCase())
      .first<{
        id: number;
        code: string;
        discount_type: string;
        discount_value: number;
        min_purchase: number | null;
        max_uses: number | null;
        used_count: number;
        valid_from: string | null;
        valid_until: string | null;
        active: number;
      }>();

    if (!coupon) {
      return jsonOk(c, { valid: false, message: 'Invalid coupon code' });
    }

    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return jsonOk(c, { valid: false, message: 'Coupon not yet valid' });
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return jsonOk(c, { valid: false, message: 'Coupon has expired' });
    }

    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return jsonOk(c, { valid: false, message: 'Coupon usage limit reached' });
    }

    if (coupon.min_purchase !== null && cartTotal < coupon.min_purchase) {
      return jsonOk(c, {
        valid: false,
        message: `Minimum purchase of ¥${coupon.min_purchase.toLocaleString()} required`
      });
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = Math.floor((cartTotal * coupon.discount_value) / 100);
    } else if (coupon.discount_type === 'fixed') {
      discountAmount = coupon.discount_value;
    }

    return jsonOk(c, {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        discountAmount
      }
    });
  } catch (err) {
    console.error('Coupon validation error:', err);
    return jsonError(c, 'Failed to validate coupon', 500);
  }
});

type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  provider_product_id: string | null;
  image_r2_key: string | null;
  tax_rate: number | null;
};

type CheckoutItem = {
  variantId: number;
  quantity: number;
};

const validateItem = (item: unknown): CheckoutItem | null => {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const variantId = Number(obj.variantId);
  const quantity = Number(obj.quantity ?? 1);
  if (!Number.isInteger(variantId) || variantId <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  return { variantId, quantity };
};

checkout.post('/checkout/quote', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  // Validate items
  let items: CheckoutItem[] = [];
  if (Array.isArray(body?.items)) {
    for (const rawItem of body.items) {
      const item = validateItem(rawItem);
      if (!item) {
        return jsonError(c, 'Invalid item in items array', 400);
      }
      items.push(item);
    }
  }

  if (items.length === 0) {
    return jsonError(c, 'No items provided', 400);
  }
  if (items.length > 20) {
    return jsonError(c, 'Too many items (max 20)', 400);
  }

  // Fetch all variant/price data in one query
  const variantIds = items.map((i) => i.variantId);
  const placeholders = variantIds.map(() => '?').join(',');
  const variantRows = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            p.provider_product_id as provider_product_id,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency,
            pr.provider_price_id as provider_price_id,
            pi.r2_key as image_r2_key,
            tr.rate as tax_rate
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
       AND pi.position = (SELECT MIN(position) FROM product_images WHERE product_id = p.id)
     WHERE v.id IN (${placeholders}) AND p.status = 'active'
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<VariantPriceRow>();

  // Build map of variant_id -> price row
  const variantMap = new Map<number, VariantPriceRow>();
  for (const row of variantRows.results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }

  // Validate all variants exist
  for (const item of items) {
    const row = variantMap.get(item.variantId);
    if (!row) {
      return jsonError(c, `Variant ${item.variantId} not found`, 404);
    }
  }

  // Check stock availability
  const stockCheck = await checkStockAvailability(
    c.env.DB,
    items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
  );

  if (!stockCheck.available) {
    const outOfStock = stockCheck.insufficientItems.map((item) => {
      const row = variantMap.get(item.variantId);
      return {
        variantId: item.variantId,
        title: row?.variant_title ?? 'Unknown',
        requested: item.requested,
        available: item.available
      };
    });
    return c.json({
      ok: false,
      message: 'Some items are out of stock',
      outOfStock
    }, 400);
  }

  // Calculate tax for all items
  const taxInputs: TaxCalculationInput[] = items.map((item) => {
    const row = variantMap.get(item.variantId)!;
    return {
      unitPrice: row.amount,
      quantity: item.quantity,
      taxRate: row.tax_rate || 0.10
    };
  });

  const taxCalculation = calculateOrderTax(taxInputs);
  const subtotal = taxCalculation.subtotal;
  const taxAmount = taxCalculation.taxAmount;
  const cartTotal = taxCalculation.totalAmount;

  let currency = 'JPY';
  if (items.length > 0) {
    const row = variantMap.get(items[0].variantId)!;
    currency = (row.currency || 'JPY').toUpperCase();
  }

  // Coupon validation and discount calculation
  const couponCode = body?.couponCode?.trim() || '';
  let discountAmount = 0;
  let couponId: number | null = null;

  if (couponCode) {
    type CouponRow = {
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
    };

    const coupon = await c.env.DB.prepare(
      `SELECT id, code, type, value, currency, min_order_amount,
              max_uses, current_uses, status, starts_at, expires_at
       FROM coupons
       WHERE code = ?`
    ).bind(couponCode).first<CouponRow>();

    if (!coupon || coupon.status !== 'active') {
      return jsonError(c, 'Invalid or inactive coupon', 400);
    }

    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return jsonError(c, 'Coupon not yet valid', 400);
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
      return jsonError(c, 'Coupon has expired', 400);
    }

    if (coupon.min_order_amount && cartTotal < coupon.min_order_amount) {
      return jsonError(c, `Minimum order amount of ${coupon.min_order_amount} required`, 400);
    }

    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return jsonError(c, 'Coupon usage limit reached', 400);
    }

    // Calculate discount
    if (coupon.type === 'percentage') {
      discountAmount = Math.floor(cartTotal * coupon.value / 100);
    } else {
      discountAmount = Math.min(coupon.value, cartTotal);
    }

    couponId = coupon.id;
  }

  // Shipping fee calculation
  const shippingSettings = await getShippingSettings(c.env);
  const shippingFee = shippingSettings.shippingFee;
  const freeThreshold = shippingSettings.freeShippingThreshold;
  const actualShippingFee = cartTotal >= freeThreshold ? 0 : shippingFee;

  // Calculate grand total
  const grandTotal = cartTotal - discountAmount + actualShippingFee;

  // Generate quote ID and store quote
  const quoteId = generateQuoteId();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  await c.env.DB.prepare(
    `INSERT INTO checkout_quotes (
       id, items_json, coupon_code, coupon_id,
       subtotal, tax_amount, cart_total,
       discount, shipping_fee, grand_total,
       currency, expires_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    quoteId,
    JSON.stringify(items),
    couponCode || null,
    couponId,
    subtotal,
    taxAmount,
    cartTotal,
    discountAmount,
    actualShippingFee,
    grandTotal,
    currency,
    expiresAt
  ).run();

  return jsonOk(c, {
    quoteId,
    breakdown: {
      subtotal,
      taxAmount,
      cartTotal,
      discount: discountAmount,
      shippingFee: actualShippingFee,
      grandTotal,
      currency
    },
    expiresAt
  });
});

export default checkout;
