import { describe, it, expect } from 'vitest';
import {
  productStatusSchema,
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productListQuerySchema,
  orderIdParamSchema,
  orderListQuerySchema,
  createVariantSchema,
  updateVariantSchema,
  variantIdParamSchema,
  productVariantParamSchema,
  priceItemSchema,
  updatePricesSchema,
  movementReasonSchema,
  createMovementSchema,
  updateThresholdSchema,
  thresholdParamSchema,
  fulfillmentStatusSchema,
  fulfillmentIdParamSchema,
  orderFulfillmentParamSchema,
  createFulfillmentSchema,
  updateFulfillmentSchema
} from './schemas';

describe('Product Schemas', () => {
  describe('productStatusSchema', () => {
    it('accepts valid statuses', () => {
      expect(productStatusSchema.parse('active')).toBe('active');
      expect(productStatusSchema.parse('draft')).toBe('draft');
    });

    it('rejects invalid status', () => {
      const result = productStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('createProductSchema', () => {
    it('accepts valid product data', () => {
      const result = createProductSchema.safeParse({
        title: 'Test Product',
        description: 'A description'
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        title: 'Test Product',
        description: 'A description',
        status: 'active',
        category: null
      });
    });

    it('trims whitespace from title', () => {
      const result = createProductSchema.safeParse({
        title: '  Test Product  '
      });
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Test Product');
    });

    it('defaults status to active', () => {
      const result = createProductSchema.safeParse({ title: 'Test' });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('active');
    });

    it('rejects empty title', () => {
      const result = createProductSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('rejects title over 255 characters', () => {
      const result = createProductSchema.safeParse({
        title: 'x'.repeat(256)
      });
      expect(result.success).toBe(false);
    });

    it('converts empty description to null', () => {
      const result = createProductSchema.safeParse({
        title: 'Test',
        description: '   '
      });
      expect(result.success).toBe(true);
      expect(result.data?.description).toBe(null);
    });

    it('accepts null description', () => {
      const result = createProductSchema.safeParse({
        title: 'Test',
        description: null
      });
      expect(result.success).toBe(true);
      expect(result.data?.description).toBe(null);
    });
  });

  describe('productIdParamSchema', () => {
    it('parses valid id string', () => {
      const result = productIdParamSchema.safeParse({ id: '123' });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(123);
    });

    it('rejects non-numeric id', () => {
      const result = productIdParamSchema.safeParse({ id: 'abc' });
      expect(result.success).toBe(false);
    });

    it('rejects zero id', () => {
      const result = productIdParamSchema.safeParse({ id: '0' });
      expect(result.success).toBe(false);
    });

    it('rejects negative id', () => {
      const result = productIdParamSchema.safeParse({ id: '-1' });
      expect(result.success).toBe(false);
    });
  });

  describe('productListQuerySchema', () => {
    it('applies defaults for missing params', () => {
      const result = productListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ q: '', status: 'all', page: 1, perPage: 20 });
    });

    it('parses page and perPage from strings', () => {
      const result = productListQuerySchema.safeParse({
        page: '2',
        perPage: '50'
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ q: '', status: 'all', page: 2, perPage: 50 });
    });

    it('caps perPage at 100', () => {
      const result = productListQuerySchema.safeParse({ perPage: '999' });
      expect(result.success).toBe(true);
      expect(result.data?.perPage).toBe(100);
    });

    it('ensures page is at least 1', () => {
      const result = productListQuerySchema.safeParse({ page: '0' });
      expect(result.success).toBe(true);
      expect(result.data?.page).toBe(1);
    });
  });
});

describe('Order Schemas', () => {
  describe('orderIdParamSchema', () => {
    it('parses valid order id', () => {
      const result = orderIdParamSchema.safeParse({ id: '456' });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(456);
    });

    it('rejects invalid id', () => {
      const result = orderIdParamSchema.safeParse({ id: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('orderListQuerySchema', () => {
    it('applies defaults', () => {
      const result = orderListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ q: '', page: 1, perPage: 20 });
    });
  });
});

describe('Variant Schemas', () => {
  describe('createVariantSchema', () => {
    it('accepts valid variant data', () => {
      const result = createVariantSchema.safeParse({
        title: 'Large',
        sku: 'PROD-001-L'
      });
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Large');
      expect(result.data?.sku).toBe('PROD-001-L');
    });

    it('trims title whitespace', () => {
      const result = createVariantSchema.safeParse({ title: '  Large  ' });
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Large');
    });

    it('converts empty sku to null', () => {
      const result = createVariantSchema.safeParse({
        title: 'Large',
        sku: ''
      });
      expect(result.success).toBe(true);
      expect(result.data?.sku).toBe(null);
    });

    it('accepts null options', () => {
      const result = createVariantSchema.safeParse({
        title: 'Large Red',
        options: null
      });
      expect(result.success).toBe(true);
      expect(result.data?.options).toBe(null);
    });

    it('rejects empty title', () => {
      const result = createVariantSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('variantIdParamSchema', () => {
    it('parses valid variant id', () => {
      const result = variantIdParamSchema.safeParse({ variantId: '789' });
      expect(result.success).toBe(true);
      expect(result.data?.variantId).toBe(789);
    });
  });

  describe('productVariantParamSchema', () => {
    it('parses both product and variant ids', () => {
      const result = productVariantParamSchema.safeParse({
        id: '1',
        variantId: '2'
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, variantId: 2 });
    });
  });
});

describe('Price Schemas', () => {
  describe('priceItemSchema', () => {
    it('accepts valid price data', () => {
      const result = priceItemSchema.safeParse({
        currency: 'jpy',
        amount: 2500
      });
      expect(result.success).toBe(true);
      expect(result.data?.currency).toBe('JPY'); // uppercase
      expect(result.data?.amount).toBe(2500);
    });

    it('defaults currency to JPY', () => {
      const result = priceItemSchema.safeParse({ amount: 1000 });
      expect(result.success).toBe(true);
      expect(result.data?.currency).toBe('JPY');
    });

    it('rejects non-integer amount', () => {
      const result = priceItemSchema.safeParse({
        amount: 25.5,
        currency: 'JPY'
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative amount', () => {
      const result = priceItemSchema.safeParse({
        amount: -100,
        currency: 'JPY'
      });
      expect(result.success).toBe(false);
    });

    it('accepts zero amount', () => {
      const result = priceItemSchema.safeParse({
        amount: 0,
        currency: 'JPY'
      });
      expect(result.success).toBe(true);
    });

    it('rejects currency not 3 chars', () => {
      const result = priceItemSchema.safeParse({
        amount: 100,
        currency: 'JP'
      });
      expect(result.success).toBe(false);
    });

    it('converts empty provider_price_id to null', () => {
      const result = priceItemSchema.safeParse({
        amount: 100,
        provider_price_id: '  '
      });
      expect(result.success).toBe(true);
      expect(result.data?.provider_price_id).toBe(null);
    });
  });

  describe('updatePricesSchema', () => {
    it('accepts array of prices', () => {
      const result = updatePricesSchema.safeParse({
        prices: [
          { amount: 1000, currency: 'JPY' },
          { amount: 2000, currency: 'USD' }
        ]
      });
      expect(result.success).toBe(true);
      expect(result.data?.prices).toHaveLength(2);
    });

    it('rejects empty prices array', () => {
      const result = updatePricesSchema.safeParse({ prices: [] });
      expect(result.success).toBe(false);
    });

    it('rejects more than 10 prices', () => {
      const prices = Array.from({ length: 11 }, () => ({
        amount: 100,
        currency: 'JPY'
      }));
      const result = updatePricesSchema.safeParse({ prices });
      expect(result.success).toBe(false);
    });
  });
});

describe('Inventory Schemas', () => {
  describe('movementReasonSchema', () => {
    it('accepts valid reasons', () => {
      const reasons = ['restock', 'adjustment', 'damaged', 'return', 'sale', 'other'];
      for (const reason of reasons) {
        expect(movementReasonSchema.parse(reason)).toBe(reason);
      }
    });

    it('rejects invalid reason', () => {
      const result = movementReasonSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('createMovementSchema', () => {
    it('accepts valid movement data', () => {
      const result = createMovementSchema.safeParse({
        variant_id: 1,
        delta: 10,
        reason: 'restock'
      });
      expect(result.success).toBe(true);
    });

    it('accepts negative delta', () => {
      const result = createMovementSchema.safeParse({
        variant_id: 1,
        delta: -5,
        reason: 'sale'
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-integer variant_id', () => {
      const result = createMovementSchema.safeParse({
        variant_id: 1.5,
        delta: 10,
        reason: 'restock'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateThresholdSchema', () => {
    it('accepts valid threshold', () => {
      const result = updateThresholdSchema.safeParse({ threshold: 5 });
      expect(result.success).toBe(true);
    });

    it('accepts zero threshold', () => {
      const result = updateThresholdSchema.safeParse({ threshold: 0 });
      expect(result.success).toBe(true);
    });

    it('rejects negative threshold', () => {
      const result = updateThresholdSchema.safeParse({ threshold: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('thresholdParamSchema', () => {
    it('parses variant id', () => {
      const result = thresholdParamSchema.safeParse({ variantId: '123' });
      expect(result.success).toBe(true);
      expect(result.data?.variantId).toBe(123);
    });
  });
});

describe('Fulfillment Schemas', () => {
  describe('fulfillmentStatusSchema', () => {
    it('accepts valid statuses', () => {
      const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
      for (const status of statuses) {
        expect(fulfillmentStatusSchema.parse(status)).toBe(status);
      }
    });

    it('rejects invalid status', () => {
      const result = fulfillmentStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('fulfillmentIdParamSchema', () => {
    it('parses valid id', () => {
      const result = fulfillmentIdParamSchema.safeParse({ id: '100' });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(100);
    });
  });

  describe('orderFulfillmentParamSchema', () => {
    it('parses order id', () => {
      const result = orderFulfillmentParamSchema.safeParse({ orderId: '200' });
      expect(result.success).toBe(true);
      expect(result.data?.orderId).toBe(200);
    });
  });

  describe('createFulfillmentSchema', () => {
    it('accepts minimal data with defaults', () => {
      const result = createFulfillmentSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        status: 'pending',
        tracking_number: null
      });
    });

    it('accepts full data', () => {
      const result = createFulfillmentSchema.safeParse({
        status: 'shipped',
        tracking_number: 'TRACK123'
      });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('shipped');
      expect(result.data?.tracking_number).toBe('TRACK123');
    });

    it('trims tracking number', () => {
      const result = createFulfillmentSchema.safeParse({
        tracking_number: '  TRACK123  '
      });
      expect(result.success).toBe(true);
      expect(result.data?.tracking_number).toBe('TRACK123');
    });
  });

  describe('updateFulfillmentSchema', () => {
    it('requires status', () => {
      const result = updateFulfillmentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts valid update data', () => {
      const result = updateFulfillmentSchema.safeParse({
        status: 'delivered',
        tracking_number: 'TRACK456'
      });
      expect(result.success).toBe(true);
    });
  });
});
