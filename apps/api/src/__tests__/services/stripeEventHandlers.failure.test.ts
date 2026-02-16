import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePaymentIntentFailedOrCanceled } from '../../services/stripeEventHandlers/failureHandler';
import type { StripeEvent } from '../../lib/stripeData';

vi.mock('../../services/inventoryCheck', () => ({
  releaseStockReservationForOrder: vi.fn()
}));

vi.mock('../../services/orderEmail', () => ({
  sendPaymentFailedEmail: vi.fn().mockResolvedValue({ success: true })
}));

import { releaseStockReservationForOrder } from '../../services/inventoryCheck';
import { sendPaymentFailedEmail } from '../../services/orderEmail';

const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const mockDb = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('SELECT id, status FROM orders WHERE id=?')) {
            const id = Number(args[0]);
            const orderMap = mockDb._orders as Map<number, { id: number; status: string }>;
            return orderMap.get(id) ?? null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { success: true };
        }
      })
    }),
    batch: vi.fn(async (stmts: any[]) => {
      for (const stmt of stmts) {
        await stmt.run();
      }
    }),
    _orders: new Map<number, { id: number; status: string }>()
  };

  return { db: mockDb, calls };
};

describe('failureHandler - handlePaymentIntentFailedOrCanceled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ignored when orderId is missing from metadata', async () => {
    const { db } = createMockEnv();
    const event: StripeEvent = {
      id: 'evt_no_order',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_no_order', metadata: {} } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_no_order', metadata: {} }
    );

    expect(result).toEqual({ received: true, ignored: true });
  });

  it('returns ignored when orderId is null in metadata', async () => {
    const { db } = createMockEnv();
    const event: StripeEvent = {
      id: 'evt_null_order',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_null', metadata: null } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_null', metadata: null }
    );

    expect(result).toEqual({ received: true, ignored: true });
  });

  it('returns ignored when order does not exist in database', async () => {
    const { db } = createMockEnv();
    const event: StripeEvent = {
      id: 'evt_order_missing',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_missing', metadata: { orderId: '999' } } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_missing', metadata: { orderId: '999' } }
    );

    expect(result).toEqual({ received: true, ignored: true });
  });

  it('releases stock reservation and updates pending order to payment_failed', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(100, { id: 100, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_fail_1',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_1', metadata: { orderId: '100' } } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      {
        id: 'pi_fail_1',
        metadata: { orderId: '100' },
        last_payment_error: { code: 'card_declined', message: 'Declined' }
      }
    );

    expect(result).toEqual({ received: true });
    expect(releaseStockReservationForOrder).toHaveBeenCalledWith(db, 100);

    const statusUpdate = calls.find(
      (c) => c.sql.includes('UPDATE orders') && c.sql.includes("status='pending'")
    );
    expect(statusUpdate).toBeDefined();

    const statusHistory = calls.find((c) =>
      c.sql.includes('INSERT INTO order_status_history')
    );
    expect(statusHistory).toBeDefined();
    expect(statusHistory?.bind[1]).toBe('pending');
    expect(statusHistory?.bind[2]).toBe('payment_failed');
  });

  it('does not update status when order is not pending', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(200, { id: 200, status: 'paid' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_fail_paid',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail_paid', metadata: { orderId: '200' } } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_fail_paid', metadata: { orderId: '200' } }
    );

    expect(result).toEqual({ received: true });

    const statusUpdate = calls.filter(
      (c) => c.sql.includes('UPDATE orders') && c.sql.includes("status='pending'")
    );
    expect(statusUpdate).toHaveLength(0);

    const statusHistory = calls.filter((c) =>
      c.sql.includes('INSERT INTO order_status_history')
    );
    expect(statusHistory).toHaveLength(0);
  });

  it('creates inbox item on stock reservation release failure', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(300, { id: 300, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockRejectedValue(
      new Error('DB connection lost')
    );

    const event: StripeEvent = {
      id: 'evt_stock_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_stock_fail', metadata: { orderId: '300' } } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_stock_fail', metadata: { orderId: '300' } }
    );

    expect(result).toEqual({ received: true });

    const inboxInsert = calls.find(
      (c) =>
        c.sql.includes('INSERT INTO inbox_items') &&
        (c.bind[0] as string).includes('Stock reservation cleanup failed')
    );
    expect(inboxInsert).toBeDefined();
    expect(inboxInsert?.bind[0]).toContain('order #300');
    expect(inboxInsert?.bind[1]).toContain('DB connection lost');
  });

  it('still processes order even when stock release fails', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(400, { id: 400, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockRejectedValue(
      new Error('stock error')
    );

    const event: StripeEvent = {
      id: 'evt_stock_fail_continue',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_cont', metadata: { orderId: '400' } } }
    };

    await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_cont', metadata: { orderId: '400' } }
    );

    // Order status should still be updated despite stock release failure
    const statusUpdate = calls.find(
      (c) => c.sql.includes('UPDATE orders') && c.sql.includes("status='pending'")
    );
    expect(statusUpdate).toBeDefined();

    // Event and inbox items for payment_failed should still be created
    const eventInsert = calls.find(
      (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'payment_failed'
    );
    expect(eventInsert).toBeDefined();
  });

  it('records event with failure details from last_payment_error', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(500, { id: 500, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_details',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_details', metadata: { orderId: '500' } } }
    };

    await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      {
        id: 'pi_details',
        metadata: { orderId: '500' },
        last_payment_error: {
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.'
        }
      }
    );

    const eventInsert = calls.find(
      (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'payment_failed'
    );
    expect(eventInsert).toBeDefined();
    const payload = JSON.parse(eventInsert?.bind[1] as string);
    expect(payload.declineCode).toBe('insufficient_funds');
    expect(payload.code).toBe('card_declined');
    expect(payload.message).toBe('Your card has insufficient funds.');
    expect(payload.orderId).toBe(500);
    expect(payload.paymentIntentId).toBe('pi_details');
    expect(payload.stripeEventId).toBe('evt_details');
  });

  it('uses cancellation_reason for canceled events', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(600, { id: 600, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_cancel',
      type: 'payment_intent.canceled',
      data: { object: { id: 'pi_cancel', metadata: { orderId: '600' } } }
    };

    await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_cancel', metadata: { orderId: '600' }, cancellation_reason: 'abandoned' }
    );

    const eventInsert = calls.find(
      (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'payment_failed'
    );
    const payload = JSON.parse(eventInsert?.bind[1] as string);
    expect(payload.message).toBe('abandoned');
    expect(payload.eventType).toBe('payment_intent.canceled');
  });

  it('creates payment_failed inbox item with kind', async () => {
    const { db, calls } = createMockEnv();
    db._orders.set(700, { id: 700, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_inbox_kind',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_inbox', metadata: { orderId: '700' } } }
    };

    await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_inbox', metadata: { orderId: '700' } }
    );

    const inboxInsert = calls.find(
      (c) =>
        c.sql.includes('INSERT INTO inbox_items') &&
        c.sql.includes("'payment_failed'") &&
        (c.bind[0] as string).includes('Payment Failed')
    );
    expect(inboxInsert).toBeDefined();
    expect(inboxInsert?.bind[0]).toContain('Order #700');
  });

  it('sends payment failed email to customer', async () => {
    const { db } = createMockEnv();
    db._orders.set(750, { id: 750, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);
    vi.mocked(sendPaymentFailedEmail).mockResolvedValue({ success: true });

    const event: StripeEvent = {
      id: 'evt_email',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_email', metadata: { orderId: '750' } } }
    };

    await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_email', metadata: { orderId: '750' } }
    );

    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      750
    );
  });

  it('does not throw when payment failed email fails', async () => {
    const { db } = createMockEnv();
    db._orders.set(760, { id: 760, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);
    vi.mocked(sendPaymentFailedEmail).mockRejectedValue(new Error('email error'));

    const event: StripeEvent = {
      id: 'evt_email_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_email_fail', metadata: { orderId: '760' } } }
    };

    // Should not throw even when email fails
    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_email_fail', metadata: { orderId: '760' } }
    );

    expect(result).toEqual({ received: true });
  });

  it('supports snake_case order_id in metadata', async () => {
    const { db } = createMockEnv();
    db._orders.set(800, { id: 800, status: 'pending' });
    vi.mocked(releaseStockReservationForOrder).mockResolvedValue(undefined);

    const event: StripeEvent = {
      id: 'evt_snake_case',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_snake', metadata: { order_id: '800' } } }
    };

    const result = await handlePaymentIntentFailedOrCanceled(
      { DB: db } as any,
      event,
      { id: 'pi_snake', metadata: { order_id: '800' } }
    );

    expect(result).toEqual({ received: true });
    expect(releaseStockReservationForOrder).toHaveBeenCalledWith(db, 800);
  });
});
