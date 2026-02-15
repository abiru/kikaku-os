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

describe('stripeEventHandlers - checkout.session.completed', () => {
  it('saves shipping details when provided', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 1200, status: 'pending', total_net: 5000 }]
    });
    const event = {
      id: 'evt_checkout_shipping',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_shipping_1',
          payment_intent: 'pi_shipping_checkout',
          amount_total: 5000,
          currency: 'jpy',
          metadata: { orderId: '1200' },
          shipping_details: {
            address: { line1: '789 Ship St', city: 'Nagoya', country: 'JP' },
            name: 'Shipping Name'
          },
          customer_details: {
            phone: '052-333-4444'
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
    expect(shippingJson.name).toBe('Shipping Name');
    expect(shippingJson.phone).toBe('052-333-4444');
  });

  it('creates fulfillment record', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 1201, status: 'pending', total_net: 3000 }]
    });
    const event = {
      id: 'evt_checkout_fulfill',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fulfill_1',
          payment_intent: 'pi_fulfill_1',
          amount_total: 3000,
          currency: 'jpy',
          metadata: { orderId: '1201' }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const fulfillmentInsert = mockDb.calls.find((c) =>
      c.sql.includes('INSERT INTO fulfillments')
    );
    expect(fulfillmentInsert).toBeDefined();
    expect(fulfillmentInsert?.bind[0]).toBe(1201);
  });

  it('ignores event when orderId is missing from metadata', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_checkout_no_order',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_no_order',
          payment_intent: null,
          amount_total: 1000,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
  });
});
