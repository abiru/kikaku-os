import { describe, it, expect, vi } from 'vitest';
import { handleStripeEvent } from '../../services/stripeEventHandlers';
import { createMockDb } from '../routes/webhooks/stripe.test.utils';

vi.mock('../../services/orderEmail', () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/inventoryCheck', () => ({
  consumeStockReservationForOrder: vi.fn().mockResolvedValue(false),
  deductStockForOrder: vi.fn().mockResolvedValue(undefined),
  releaseStockReservationForOrder: vi.fn().mockResolvedValue(undefined)
}));

describe('stripeEventHandlers - payment_intent.succeeded', () => {
  it('updates order to paid and inserts payment', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 100, status: 'pending', total_net: 5000 }]
    });
    const event = {
      id: 'evt_pi_success_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_success_1',
          amount_received: 5000,
          currency: 'jpy',
          metadata: { orderId: '100' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBeUndefined();
    expect(mockDb.state.orders.get(100)?.status).toBe('paid');
    expect(mockDb.state.orders.get(100)?.provider_payment_intent_id).toBe('pi_success_1');
    expect(mockDb.state.orders.get(100)?.paid_at).toBeTruthy();

    const paymentInsert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO payments'));
    expect(paymentInsert).toBeDefined();
    expect(paymentInsert?.bind[0]).toBe(100);
    expect(paymentInsert?.bind[1]).toBe(5000);
    expect(paymentInsert?.bind[2]).toBe('JPY');
  });

  it('returns ignored when orderId is missing', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_pi_no_order',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_order',
          amount_received: 1000,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
  });

  it('returns ignored when order does not exist', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_pi_order_missing',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_order_missing',
          amount_received: 1000,
          currency: 'jpy',
          metadata: { orderId: 'invalid' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
  });

  it('captures shipping address from payment intent', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 200, status: 'pending', total_net: 3000 }]
    });
    const event = {
      id: 'evt_pi_shipping',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_shipping_1',
          amount_received: 3000,
          currency: 'jpy',
          metadata: { orderId: '200' },
          shipping: {
            name: 'Test User',
            address: { line1: '123 Test St', city: 'Tokyo', country: 'JP' },
            phone: '090-1234-5678'
          }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const metadataUpdate = mockDb.calls.find(
      (c) => c.sql.includes('json_set') && c.sql.includes('$.shipping')
    );
    expect(metadataUpdate).toBeDefined();
    const shippingJson = JSON.parse(metadataUpdate?.bind[0] as string);
    expect(shippingJson.name).toBe('Test User');
    expect(shippingJson.address.city).toBe('Tokyo');
  });

  it('captures billing details from charges when no shipping', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 201, status: 'pending', total_net: 4000 }]
    });
    const event = {
      id: 'evt_pi_billing',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_billing_1',
          amount_received: 4000,
          currency: 'jpy',
          metadata: { orderId: '201' },
          charges: {
            data: [
              {
                billing_details: {
                  name: 'Billing User',
                  email: 'billing@example.com',
                  phone: '03-1111-2222',
                  address: { line1: '456 Billing St', city: 'Osaka', country: 'JP' }
                }
              }
            ]
          }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const metadataUpdate = mockDb.calls.find(
      (c) => c.sql.includes('json_set') && c.sql.includes('$.shipping')
    );
    expect(metadataUpdate).toBeDefined();
    const addressJson = JSON.parse(metadataUpdate?.bind[0] as string);
    expect(addressJson.name).toBe('Billing User');
    expect(addressJson.email).toBe('billing@example.com');
  });

  it('handles duplicate payment via idempotency', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 300, status: 'pending', total_net: 2000 }]
    });
    const event = {
      id: 'evt_pi_dup',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_dup_1',
          amount_received: 2000,
          currency: 'jpy',
          metadata: { orderId: '300' }
        }
      }
    };

    const first = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(first.received).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(mockDb.state.payments).toHaveLength(1);

    const second = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(second.received).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(mockDb.state.payments).toHaveLength(1);
  });

  it('extracts payment method from charges data', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 400, status: 'pending', total_net: 6000 }]
    });
    const event = {
      id: 'evt_pi_bank',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_bank_1',
          amount_received: 6000,
          currency: 'jpy',
          metadata: { orderId: '400' },
          charges: {
            data: [
              {
                payment_method_details: { type: 'customer_balance' }
              }
            ]
          }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const paymentInsert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO payments'));
    expect(paymentInsert?.bind[3]).toBe('customer_balance');
  });

  it('uses amount_received over amount field', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 401, status: 'pending', total_net: 7000 }]
    });
    const event = {
      id: 'evt_pi_amount',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_amount_1',
          amount_received: 7000,
          amount: 8000,
          currency: 'jpy',
          metadata: { orderId: '401' }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const paymentInsert = mockDb.calls.find((c) => c.sql.includes('INSERT INTO payments'));
    expect(paymentInsert?.bind[1]).toBe(7000);
  });

  describe('order_id extraction', () => {
    it('supports snake_case order_id in metadata', async () => {
      const mockDb = createMockDb({
        orders: [{ id: 1100, status: 'pending', total_net: 2000 }]
      });
      const event = {
        id: 'evt_snake_case',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_snake_case',
            amount_received: 2000,
            currency: 'jpy',
            metadata: { order_id: '1100' }
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);
      expect(result.ignored).toBeUndefined();
      expect(mockDb.state.orders.get(1100)?.status).toBe('paid');
    });
  });

  describe('idempotency - cross-handler', () => {
    it('does not create duplicate payment records across handler invocations', async () => {
      const mockDb = createMockDb({
        orders: [{ id: 1000, status: 'pending', total_net: 8000 }]
      });
      const event = {
        id: 'evt_idem_cross',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_idem_cross',
            amount_received: 8000,
            currency: 'jpy',
            metadata: { orderId: '1000' }
          }
        }
      };

      await handleStripeEvent({ DB: mockDb } as any, event as any);
      await handleStripeEvent({ DB: mockDb } as any, event as any);
      await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(mockDb.state.payments).toHaveLength(1);
      expect(mockDb.state.orders.get(1000)?.status).toBe('paid');
    });
  });
});
