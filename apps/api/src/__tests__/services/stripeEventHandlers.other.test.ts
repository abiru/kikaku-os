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

describe('stripeEventHandlers - payment_intent.payment_failed', () => {
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

describe('stripeEventHandlers - payment_intent.canceled', () => {
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

describe('stripeEventHandlers - charge.dispute.created', () => {
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

describe('stripeEventHandlers - charge.dispute.updated', () => {
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

describe('stripeEventHandlers - bank transfer events', () => {
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

describe('stripeEventHandlers - unrecognized events', () => {
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
