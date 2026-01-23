import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import checkout from '../../../routes/checkout/checkout';

const createMockDb = (
  steps: string[],
  variantOverride?: Partial<Record<string, unknown>> | null,
  variantExists = true,
  productOverride?: Partial<Record<string, unknown>> | null,
  customerOverride?: Partial<Record<string, unknown>> | null
) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const baseVariantRow = {
    variant_id: 10,
    variant_title: 'Standard',
    product_id: 1,
    product_title: 'Sample',
    price_id: 99,
    amount: 1200,
    currency: 'jpy',
    provider_price_id: 'price_test_123',
    provider_product_id: 'prod_test_123',
    image_r2_key: null,
  };
  const baseProductRow = {
    id: 1,
    title: 'Sample',
    description: 'A sample product',
    provider_product_id: 'prod_test_123',
  };
  const baseCustomerRow = {
    id: 77,
    email: null,
    stripe_customer_id: null,
  };
  const variantRow = variantOverride === null ? null : { ...baseVariantRow, ...variantOverride };
  const productRow = productOverride === null ? null : { ...baseProductRow, ...productOverride };
  const customerRow = customerOverride === null ? null : { ...baseCustomerRow, ...customerOverride };
  const variantId = (variantRow?.variant_id ?? baseVariantRow.variant_id) as number;
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM variants v')) {
            return variantRow;
          }
          if (sql.includes('FROM variants WHERE')) {
            return variantExists ? { id: variantId } : null;
          }
          if (sql.includes('FROM customers WHERE id')) {
            return customerRow;
          }
          if (sql.includes('FROM customers WHERE email')) {
            return null;
          }
          if (sql.includes('FROM products WHERE')) {
            return productRow;
          }
          return null;
        },
        all: async () => {
          // For multi-item checkout query
          if (sql.includes('FROM variants v')) {
            return { results: variantRow ? [variantRow] : [] };
          }
          return { results: [] };
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO orders')) {
            steps.push('insert-order');
          }
          if (sql.includes('INSERT INTO orders')) {
            return { meta: { last_row_id: 123, changes: 1 } };
          }
          if (sql.includes('INSERT INTO customers')) {
            return { meta: { last_row_id: 77, changes: 1 } };
          }
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

describe('GET /checkout/config', () => {
  it('returns config with shipping settings', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const env = {
      SHIPPING_FEE_AMOUNT: '500',
      FREE_SHIPPING_THRESHOLD: '5000'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/config',
      { method: 'GET' },
      env
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.shippingFee).toBe(500);
    expect(json.freeShippingThreshold).toBe(5000);
    expect(json.enableBankTransfer).toBeUndefined();
  });
});
