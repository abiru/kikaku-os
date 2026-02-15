import { describe, it, expect } from 'vitest';
import { createMockDb, createApp } from './helpers';

describe('Storefront API', () => {
  describe('GET /orders/:id', () => {
    it('returns order by ID with items, shipping and fulfillments', async () => {
      const db = {
        prepare: (sql: string) => {
          return {
            bind: (..._args: any[]) => ({
              first: async () => {
                if (sql.includes('FROM orders')) {
                  return {
                    id: 123,
                    status: 'paid',
                    subtotal: 5000,
                    tax_amount: 500,
                    total_amount: 5500,
                    shipping_fee: 0,
                    total_discount: 0,
                    currency: 'JPY',
                    created_at: '2024-01-01T00:00:00Z',
                    paid_at: '2024-01-01T00:05:00Z',
                    customer_email: 'test@example.com',
                    metadata: JSON.stringify({
                      shipping: {
                        name: 'Test User',
                        address: {
                          line1: '1-2-3 Test St',
                          city: 'Tokyo',
                          postal_code: '123-4567'
                        }
                      }
                    })
                  };
                }
                return null;
              },
              all: async () => {
                if (sql.includes('FROM order_items')) {
                  return {
                    results: [
                      {
                        product_title: 'Test Product',
                        variant_title: 'Medium',
                        quantity: 2,
                        unit_price: 2500
                      }
                    ]
                  };
                }
                if (sql.includes('FROM fulfillments')) {
                  return {
                    results: [
                      {
                        id: 1,
                        status: 'shipped',
                        tracking_number: 'TRACK-123',
                        metadata: JSON.stringify({ carrier: 'Yamato' }),
                        created_at: '2024-01-02T00:00:00Z',
                        updated_at: '2024-01-02T12:00:00Z'
                      }
                    ]
                  };
                }
                return { results: [] };
              }
            }),
            first: async () => null,
            all: async () => ({ results: [] })
          };
        }
      };

      const { fetch } = createApp(db);
      const res = await fetch('/store/orders/123');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.order.id).toBe(123);
      expect(json.order.status).toBe('paid');
      expect(json.order.subtotal).toBe(5000);
      expect(json.order.tax_amount).toBe(500);
      expect(json.order.total_amount).toBe(5500);
      expect(json.order.shipping_fee).toBe(0);
      expect(json.order.shipping).toBeDefined();
      expect(json.order.shipping.name).toBe('Test User');
      expect(json.order.items.length).toBe(1);
      expect(json.order.items[0].title).toBe('Test Product - Medium');
      expect(json.order.fulfillments).toHaveLength(1);
      expect(json.order.fulfillments[0].tracking_number).toBe('TRACK-123');
      expect(json.order.fulfillments[0].carrier).toBe('Yamato');
    });

    it('returns 202 when polling pending order', async () => {
      const db = {
        prepare: (sql: string) => ({
          bind: (..._args: any[]) => ({
            first: async () => ({
              id: 456,
              status: 'pending',
              subtotal: 2727,
              tax_amount: 273,
              total_amount: 3000,
              shipping_fee: 0,
              total_discount: 0,
              currency: 'JPY',
              created_at: '2024-01-01T00:00:00Z',
              paid_at: null,
              customer_email: 'pending@example.com',
              metadata: null
            }),
            all: async () => ({ results: [] })
          })
        })
      };

      const { fetch } = createApp(db);
      const res = await fetch('/store/orders/456?poll=true');

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.status).toBe('pending');
    });

    it('returns 404 for non-existent order', async () => {
      const db = {
        prepare: (_sql: string) => ({
          bind: (..._args: any[]) => ({
            first: async () => null,
            all: async () => ({ results: [] })
          })
        })
      };

      const { fetch } = createApp(db);
      const res = await fetch('/store/orders/999');

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 404 for invalid order token', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/invalid');

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });
  });
});
