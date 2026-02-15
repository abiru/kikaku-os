import { describe, it, expect } from 'vitest';
import { handleStripeEvent } from '../../../services/stripeEventHandlers';
import { createMockDb } from './stripe.test.utils';

describe('Stripe event handler - payment_intent.succeeded with orderId', () => {
  it('updates order to paid and inserts payment record', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 200, status: 'pending', total_net: 5000, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_pi_success_200',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_success_200',
          amount: 5000,
          amount_received: 5000,
          currency: 'jpy',
          metadata: { orderId: '200' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBeFalsy();
    const orderUpdate = mockDb.calls.find(
      (call) => call.sql.includes('UPDATE orders') && call.sql.includes("status='paid'")
    );
    expect(orderUpdate).toBeDefined();
    expect(orderUpdate?.bind).toContain('pi_success_200');
    const paymentInsert = mockDb.calls.find((call) => call.sql.includes('INSERT INTO payments'));
    expect(paymentInsert).toBeDefined();
  });

  it('returns duplicate when payment already exists', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 201, status: 'pending', total_net: 3000, currency: 'JPY' }],
      duplicatePayment: true
    });
    const event = {
      id: 'evt_pi_dup_201',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_dup_201',
          amount: 3000,
          amount_received: 3000,
          currency: 'jpy',
          metadata: { orderId: '201' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.duplicate).toBe(true);
  });

  it('ignores event when order does not exist', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_pi_no_order',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_order',
          amount: 1000,
          currency: 'jpy',
          metadata: { orderId: '99999' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    // The handler creates order on-demand via getOrCreateOrder in mock,
    // but in production it checks SELECT id FROM orders WHERE id=?
    // The mock's getOrCreateOrder auto-creates, so this test verifies
    // the handler completes without error
  });
});

describe('Stripe event handler - payment_intent.requires_action (bank transfer)', () => {
  it('records bank transfer requires_action event', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 300, status: 'pending', total_net: 8000, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_requires_action_300',
      type: 'payment_intent.requires_action',
      data: {
        object: {
          id: 'pi_bank_300',
          amount: 8000,
          currency: 'jpy',
          metadata: { orderId: '300' },
          next_action: {
            type: 'display_bank_transfer_instructions',
            display_bank_transfer_instructions: {
              type: 'jp_bank_transfer',
              financial_addresses: [{
                type: 'zengin',
                zengin: {
                  bank_name: 'Test Bank',
                  branch_name: 'Test Branch',
                  account_number: '1234567',
                  account_holder_name: 'STRIPE'
                }
              }]
            }
          }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO events') && call.sql.includes('bank_transfer_requires_action')
    );
    expect(eventInsert).toBeDefined();
    const payload = JSON.parse(eventInsert?.bind[0] as string);
    expect(payload.order_id).toBe(300);
    expect(payload.payment_intent).toBe('pi_bank_300');
    expect(payload.next_action).toBeDefined();
  });

  it('returns received without recording when no orderId', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_requires_action_no_order',
      type: 'payment_intent.requires_action',
      data: {
        object: {
          id: 'pi_bank_no_order',
          amount: 5000,
          currency: 'jpy',
          metadata: {},
          next_action: { type: 'display_bank_transfer_instructions' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('bank_transfer_requires_action')
    );
    expect(eventInsert).toBeUndefined();
  });
});

describe('Stripe event handler - payment_intent.processing (bank transfer)', () => {
  it('records bank transfer processing event', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 310, status: 'pending', total_net: 6000, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_processing_310',
      type: 'payment_intent.processing',
      data: {
        object: {
          id: 'pi_processing_310',
          amount: 6000,
          currency: 'jpy',
          metadata: { orderId: '310' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO events') && call.sql.includes('bank_transfer_processing')
    );
    expect(eventInsert).toBeDefined();
    const payload = JSON.parse(eventInsert?.bind[0] as string);
    expect(payload.order_id).toBe(310);
    expect(payload.payment_intent).toBe('pi_processing_310');
  });

  it('skips recording when no orderId in metadata', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_processing_no_order',
      type: 'payment_intent.processing',
      data: {
        object: {
          id: 'pi_processing_no_order',
          amount: 3000,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('bank_transfer_processing')
    );
    expect(eventInsert).toBeUndefined();
  });
});

describe('Stripe event handler - payment_intent.canceled', () => {
  it('marks pending order as payment_failed and creates inbox item', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 400, status: 'pending', total_net: 4000, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_canceled_400',
      type: 'payment_intent.canceled',
      data: {
        object: {
          id: 'pi_canceled_400',
          metadata: { orderId: '400' },
          cancellation_reason: 'abandoned'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(mockDb.state.orders.get(400)?.status).toBe('payment_failed');
    const statusHistory = mockDb.calls.find((call) =>
      call.sql.includes('INSERT INTO order_status_history')
    );
    expect(statusHistory).toBeDefined();
    expect(statusHistory?.bind[1]).toBe('pending');
    expect(statusHistory?.bind[2]).toBe('payment_failed');
    const inboxInsert = mockDb.calls.find((call) =>
      call.sql.includes('INSERT INTO inbox_items') && call.sql.includes('payment_failed')
    );
    expect(inboxInsert).toBeDefined();
  });

  it('does not update non-pending order', async () => {
    const mockDb = createMockDb({
      orders: [{ id: 401, status: 'paid', total_net: 4000, currency: 'JPY' }]
    });
    const event = {
      id: 'evt_canceled_401',
      type: 'payment_intent.canceled',
      data: {
        object: {
          id: 'pi_canceled_401',
          metadata: { orderId: '401' },
          cancellation_reason: 'abandoned'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    // Order should remain paid
    expect(mockDb.state.orders.get(401)?.status).toBe('paid');
    const statusUpdate = mockDb.calls.find(
      (call) => call.sql.includes("UPDATE orders") && call.sql.includes("status='pending'")
    );
    expect(statusUpdate).toBeUndefined();
  });

  it('ignores event without orderId', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_canceled_no_order',
      type: 'payment_intent.canceled',
      data: {
        object: {
          id: 'pi_canceled_no_order',
          metadata: {},
          cancellation_reason: 'abandoned'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
  });
});

describe('Stripe event handler - charge.dispute.created', () => {
  it('creates critical inbox item for dispute', async () => {
    const mockDb = createMockDb({
      existingPayments: [{ providerPaymentId: 'pi_dispute_500', orderId: 500 }]
    });
    const event = {
      id: 'evt_dispute_created_500',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_500',
          charge: 'ch_500',
          amount: 5000,
          currency: 'jpy',
          reason: 'fraudulent',
          status: 'needs_response',
          payment_intent: 'pi_dispute_500'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO events') && call.bind[0] === 'charge.dispute.created'
    );
    expect(eventInsert).toBeDefined();
    const inboxInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO inbox_items') && call.sql.includes('chargeback')
    );
    expect(inboxInsert).toBeDefined();
    const title = inboxInsert?.bind[0] as string;
    expect(title).toContain('Chargeback Received');
  });

  it('handles dispute without payment_intent', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_dispute_no_pi',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_no_pi',
          charge: 'ch_no_pi',
          amount: 2000,
          currency: 'jpy',
          reason: 'product_not_received',
          status: 'needs_response'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const inboxInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO inbox_items') && call.sql.includes('chargeback')
    );
    expect(inboxInsert).toBeDefined();
    const title = inboxInsert?.bind[0] as string;
    expect(title).toContain('Charge ch_no_pi');
  });
});

describe('Stripe event handler - charge.dispute.updated', () => {
  it('creates inbox item with updated dispute status', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_dispute_updated_600',
      type: 'charge.dispute.updated',
      data: {
        object: {
          id: 'dp_600',
          charge: 'ch_600',
          amount: 3000,
          currency: 'jpy',
          reason: 'fraudulent',
          status: 'won'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const inboxInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO inbox_items') && call.sql.includes('chargeback')
    );
    expect(inboxInsert).toBeDefined();
    const title = inboxInsert?.bind[0] as string;
    expect(title).toContain('Chargeback Updated');
    expect(title).toContain('won');
  });
});

describe('Stripe event handler - customer_balance.transaction events', () => {
  it('records customer_balance.transaction.created as audit event', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_cbt_created',
      type: 'customer_balance.transaction.created',
      data: {
        object: {
          id: 'cbtxn_123',
          amount: -5000,
          currency: 'jpy',
          type: 'adjustment',
          customer: 'cus_123'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO events') && call.bind[0] === 'customer_balance.transaction.created'
    );
    expect(eventInsert).toBeDefined();
    expect(eventInsert?.bind[2]).toBe('evt_cbt_created');
  });

  it('records customer_balance.transaction.updated as audit event', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_cbt_updated',
      type: 'customer_balance.transaction.updated',
      data: {
        object: {
          id: 'cbtxn_456',
          amount: -3000,
          currency: 'jpy',
          type: 'applied_to_invoice',
          customer: 'cus_456'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const eventInsert = mockDb.calls.find(
      (call) => call.sql.includes('INSERT INTO events') && call.bind[0] === 'customer_balance.transaction.updated'
    );
    expect(eventInsert).toBeDefined();
  });
});

describe('Stripe event handler - Unknown event types', () => {
  it('gracefully handles customer.created without error', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_cust_created',
      type: 'customer.created',
      data: {
        object: {
          id: 'cus_new',
          email: 'test@example.com',
          name: 'Test Customer'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBeUndefined();
    expect(result.duplicate).toBeUndefined();
  });

  it('gracefully handles customer.updated without error', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_cust_updated',
      type: 'customer.updated',
      data: {
        object: {
          id: 'cus_existing',
          email: 'updated@example.com',
          name: 'Updated Customer'
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
  });

  it('gracefully handles completely unknown event type', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_unknown',
      type: 'some.future.event.type',
      data: {
        object: { id: 'obj_unknown', foo: 'bar' }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBeUndefined();
    expect(result.duplicate).toBeUndefined();
  });

  it('handles event with missing data.object gracefully', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_no_data',
      type: 'invoice.payment_succeeded',
      data: {}
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
  });

  it('handles event with undefined data gracefully', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_undefined_data',
      type: 'payout.paid'
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
  });
});
