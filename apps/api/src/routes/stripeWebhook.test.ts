import { describe, it, expect } from 'vitest';
import { handleStripeEvent } from './stripe';

const createMockDb = (options?: { duplicatePayment?: boolean }) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT id FROM orders')) {
            return { id: 123 };
          }
          if (sql.includes('SELECT id FROM payments')) {
            return null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO payments') && options?.duplicatePayment) {
            throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
          }
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

describe('Stripe webhook handling', () => {
  it('handles checkout.session.completed and inserts payment', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_intent: 'pi_test_123',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { order_id: '123' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    const updateCall = mockDb.calls.find((call) => call.sql.includes('UPDATE orders'));
    const insertCall = mockDb.calls.find((call) => call.sql.includes('INSERT INTO payments'));
    expect(updateCall?.bind[0]).toBe('cs_test_123');
    expect(updateCall?.bind[1]).toBe('pi_test_123');
    expect(updateCall?.bind[2]).toBe(123);
    expect(insertCall?.bind[0]).toBe(123);
    expect(insertCall?.bind[3]).toBe('pi_test_123');
  });

  it('returns duplicate when payment insert hits unique constraint', async () => {
    const mockDb = createMockDb({ duplicatePayment: true });
    const event = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_dup',
          payment_intent: 'pi_test_dup',
          amount_total: 2500,
          currency: 'jpy',
          metadata: { order_id: '123' }
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);
    expect(result.received).toBe(true);
    expect(result.duplicate).toBe(true);
  });

  it('ignores payment_intent.succeeded without order_id', async () => {
    const mockDb = createMockDb();
    const event = {
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_no_order',
          amount: 1200,
          currency: 'jpy',
          metadata: {}
        }
      }
    };

    const result = await handleStripeEvent({ DB: mockDb } as any, event as any);

    expect(result.received).toBe(true);
    expect(result.ignored).toBe(true);
    const orderInsert = mockDb.calls.find((call) => call.sql.includes('INSERT INTO orders'));
    expect(orderInsert).toBeUndefined();
  });
});
