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

describe('stripeEventHandlers - charge.refunded', () => {
  it('creates refund record and updates order to refunded for full refund', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_full', orderId: 500 }],
      orders: [{ id: 500, status: 'paid', total_net: 3000 }]
    });
    const event = {
      id: 'evt_charge_refund_full',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund_full',
          amount_refunded: 3000,
          currency: 'jpy',
          payment_intent: 'pi_refund_full',
          refunds: {
            data: [
              {
                id: 're_full_1',
                amount: 3000,
                currency: 'jpy',
                payment_intent: 'pi_refund_full',
                metadata: { orderId: '500' }
              }
            ]
          },
          metadata: { orderId: '500' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(mockDb.state.refunds).toHaveLength(1);
    expect(mockDb.state.refunds[0].provider_refund_id).toBe('re_full_1');
    expect(mockDb.state.refunds[0].amount).toBe(3000);
    expect(mockDb.state.orders.get(500)?.status).toBe('refunded');
  });

  it('creates refund record and updates order to partially_refunded for partial refund', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_partial', orderId: 501 }],
      orders: [{ id: 501, status: 'paid', total_net: 10000 }]
    });
    const event = {
      id: 'evt_charge_refund_partial',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund_partial',
          amount_refunded: 3000,
          currency: 'jpy',
          payment_intent: 'pi_refund_partial',
          refunds: {
            data: [
              {
                id: 're_partial_1',
                amount: 3000,
                currency: 'jpy',
                payment_intent: 'pi_refund_partial',
                metadata: { orderId: '501' }
              }
            ]
          },
          metadata: { orderId: '501' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(mockDb.state.refunds).toHaveLength(1);
    expect(mockDb.state.orders.get(501)?.status).toBe('partially_refunded');
    expect(mockDb.state.orders.get(501)?.refunded_amount).toBe(3000);
  });

  it('handles duplicate refund gracefully', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_dup', orderId: 502 }],
      orders: [{ id: 502, status: 'paid', total_net: 5000 }]
    });
    const event = {
      id: 'evt_refund_dup_svc',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund_dup',
          amount_refunded: 5000,
          currency: 'jpy',
          payment_intent: 'pi_refund_dup',
          refunds: {
            data: [
              {
                id: 're_dup_svc',
                amount: 5000,
                currency: 'jpy',
                payment_intent: 'pi_refund_dup',
                metadata: { orderId: '502' }
              }
            ]
          },
          metadata: { orderId: '502' }
        }
      }
    };

    const first = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(first.received).toBe(true);
    expect(mockDb.state.refunds).toHaveLength(1);

    const second = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(second.received).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(mockDb.state.refunds).toHaveLength(1);
  });

  it('records status change in order_status_history on refund', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_refund_hist', orderId: 503 }],
      orders: [{ id: 503, status: 'paid', total_net: 2000 }]
    });
    const event = {
      id: 'evt_refund_hist',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund_hist',
          amount_refunded: 2000,
          currency: 'jpy',
          payment_intent: 'pi_refund_hist',
          refunds: {
            data: [
              {
                id: 're_hist_1',
                amount: 2000,
                currency: 'jpy',
                payment_intent: 'pi_refund_hist',
                metadata: { orderId: '503' }
              }
            ]
          },
          metadata: { orderId: '503' }
        }
      }
    };

    await handleStripeEvent({ DB: mockDb } as any, event as any);

    const historyEntry = mockDb.state.orderStatusHistory.find(
      (h) => h.order_id === 503
    );
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.old_status).toBe('paid');
    expect(historyEntry?.new_status).toBe('refunded');
    expect(historyEntry?.stripe_event_id).toBe('evt_refund_hist');
  });

  describe('idempotency - cross-handler', () => {
    it('does not create duplicate refund records across handler invocations', async () => {
      const mockDb = createMockDb({
        existingPayments: [{ providerPaymentId: 'pi_idem_refund', orderId: 1001 }],
        orders: [{ id: 1001, status: 'paid', total_net: 4000 }]
      });
      const event = {
        id: 'evt_idem_refund',
        type: 'refund.succeeded',
        data: {
          object: {
            id: 're_idem_1',
            amount: 4000,
            currency: 'jpy',
            payment_intent: 'pi_idem_refund',
            metadata: { orderId: '1001' }
          }
        }
      };

      await handleStripeEvent({ DB: mockDb } as any, event as any);
      await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(mockDb.state.refunds).toHaveLength(1);
    });
  });
});
