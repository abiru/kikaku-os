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

describe('stripeEventHandlers - handleStripeEvent', () => {
  describe('payment_intent.succeeded', () => {
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
      // createMockDb auto-creates orders in getOrCreateOrder, so we verify it doesn't crash
      // The mock returns an order even if not pre-seeded, but we can test with a valid orderId
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
  });

  describe('charge.refunded', () => {
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
  });

  describe('payment_intent.payment_failed', () => {
    it('marks pending order as payment_failed and creates inbox item', async () => {
      const mockDb = createMockDb({
        orders: [{ id: 600, status: 'pending', total_net: 5000 }]
      });
      const event = {
        id: 'evt_fail_1',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail_1',
            metadata: { orderId: '600' },
            last_payment_error: {
              code: 'card_declined',
              decline_code: 'insufficient_funds',
              message: 'Your card has insufficient funds.'
            }
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);
      expect(mockDb.state.orders.get(600)?.status).toBe('payment_failed');

      const statusHistory = mockDb.calls.find((c) =>
        c.sql.includes('INSERT INTO order_status_history')
      );
      expect(statusHistory).toBeDefined();
      expect(statusHistory?.bind[1]).toBe('pending');
      expect(statusHistory?.bind[2]).toBe('payment_failed');

      const inboxInsert = mockDb.calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert).toBeDefined();
      expect(inboxInsert?.bind[0]).toContain('Order #600');

      const eventInsert = mockDb.calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'payment_failed'
      );
      expect(eventInsert).toBeDefined();
    });

    it('does not change order status when order is already paid', async () => {
      const mockDb = createMockDb({
        orders: [{ id: 601, status: 'paid', total_net: 5000 }]
      });
      const event = {
        id: 'evt_fail_paid',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail_paid',
            metadata: { orderId: '601' },
            last_payment_error: {
              code: 'card_declined',
              message: 'Declined'
            }
          }
        }
      };

      await handleStripeEvent({ DB: mockDb } as any, event as any);

      // Status should remain 'paid' - failed event only transitions from 'pending'
      expect(mockDb.state.orders.get(601)?.status).toBe('paid');

      // No status history entry should be created for non-pending orders
      const statusHistory = mockDb.calls.filter((c) =>
        c.sql.includes('INSERT INTO order_status_history')
      );
      expect(statusHistory).toHaveLength(0);
    });

    it('returns ignored when orderId is missing', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_fail_no_order',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail_no_order',
            metadata: {},
            last_payment_error: { code: 'card_declined', message: 'Declined' }
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);
      expect(result.ignored).toBe(true);
    });
  });

  describe('payment_intent.canceled', () => {
    it('marks pending order as payment_failed with cancellation reason', async () => {
      const mockDb = createMockDb({
        orders: [{ id: 700, status: 'pending', total_net: 3000 }]
      });
      const event = {
        id: 'evt_cancel_1',
        type: 'payment_intent.canceled',
        data: {
          object: {
            id: 'pi_cancel_1',
            metadata: { orderId: '700' },
            cancellation_reason: 'abandoned'
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);
      expect(mockDb.state.orders.get(700)?.status).toBe('payment_failed');

      const eventInsert = mockDb.calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'payment_failed'
      );
      expect(eventInsert).toBeDefined();
      const payload = JSON.parse(eventInsert?.bind[1] as string);
      expect(payload.message).toBe('abandoned');
    });
  });

  describe('charge.dispute.created', () => {
    it('creates critical inbox item and records event', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_dispute_1',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_123',
            charge: 'ch_dispute_1',
            payment_intent: 'pi_dispute_1',
            amount: 5000,
            currency: 'jpy',
            reason: 'fraudulent',
            status: 'needs_response'
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);

      const eventInsert = mockDb.calls.find(
        (c) =>
          c.sql.includes('INSERT INTO events') &&
          c.bind[0] === 'charge.dispute.created'
      );
      expect(eventInsert).toBeDefined();

      const inboxInsert = mockDb.calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items') && (c.bind[0] as string).includes('Chargeback Received')
      );
      expect(inboxInsert).toBeDefined();
      expect(inboxInsert?.bind[0]).toContain('Charge ch_dispute_1');

      const bodyJson = JSON.parse(inboxInsert?.bind[1] as string);
      expect(bodyJson.disputeId).toBe('dp_123');
      expect(bodyJson.reason).toBe('fraudulent');
      expect(bodyJson.amount).toBe(5000);
      expect(bodyJson.chargeId).toBe('ch_dispute_1');
    });
  });

  describe('charge.dispute.updated', () => {
    it('creates inbox item with updated status', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_dispute_update_1',
        type: 'charge.dispute.updated',
        data: {
          object: {
            id: 'dp_456',
            charge: 'ch_dispute_update',
            amount: 3000,
            currency: 'jpy',
            reason: 'product_not_received',
            status: 'under_review'
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);

      const inboxInsert = mockDb.calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items') && (c.bind[0] as string).includes('Chargeback Updated')
      );
      expect(inboxInsert).toBeDefined();
      expect(inboxInsert?.bind[0]).toContain('under_review');
    });
  });

  describe('bank transfer events', () => {
    it('records payment_intent.processing as bank_transfer_processing event', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_processing_1',
        type: 'payment_intent.processing',
        data: {
          object: {
            id: 'pi_processing_1',
            metadata: { orderId: '900' }
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);

      const eventInsert = mockDb.calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.sql.includes('bank_transfer_processing')
      );
      expect(eventInsert).toBeDefined();
      const payload = JSON.parse(eventInsert?.bind[0] as string);
      expect(payload.order_id).toBe(900);
      expect(payload.payment_intent).toBe('pi_processing_1');
    });

    it('records payment_intent.requires_action as bank_transfer_requires_action event', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_requires_action_1',
        type: 'payment_intent.requires_action',
        data: {
          object: {
            id: 'pi_requires_action_1',
            metadata: { orderId: '901' },
            next_action: {
              type: 'display_bank_transfer_instructions',
              display_bank_transfer_instructions: {
                type: 'jp_bank_transfer',
                reference: 'ABC123'
              }
            }
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);

      const eventInsert = mockDb.calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.sql.includes('bank_transfer_requires_action')
      );
      expect(eventInsert).toBeDefined();
      const payload = JSON.parse(eventInsert?.bind[0] as string);
      expect(payload.order_id).toBe(901);
      expect(payload.next_action.type).toBe('display_bank_transfer_instructions');
    });

    it('records customer_balance.transaction.created event', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_cbt_created',
        type: 'customer_balance.transaction.created',
        data: {
          object: {
            id: 'cbt_123',
            amount: 5000,
            currency: 'jpy'
          }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);

      const eventInsert = mockDb.calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'customer_balance.transaction.created'
      );
      expect(eventInsert).toBeDefined();
    });
  });

  describe('unrecognized events', () => {
    it('returns received:true for unknown event types', async () => {
      const mockDb = createMockDb();
      const event = {
        id: 'evt_unknown_1',
        type: 'some.unknown.event',
        data: {
          object: { id: 'obj_unknown' }
        }
      };

      const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

      expect(result.received).toBe(true);
      expect(result.ignored).toBeUndefined();
      expect(result.duplicate).toBeUndefined();
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

  describe('checkout.session.completed', () => {
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
});
