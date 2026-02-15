import { describe, it, expect, vi } from 'vitest';
import { handleChargeDispute } from '../../services/stripeEventHandlers/disputeHandler';
import type { StripeEvent } from '../../lib/stripeData';

const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const mockDb = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('SELECT order_id FROM payments WHERE provider_payment_id')) {
            const paymentMap = mockDb._payments as Map<string, { order_id: number }>;
            return paymentMap.get(String(args[0])) ?? null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          return { success: true };
        }
      })
    }),
    _payments: new Map<string, { order_id: number }>()
  };

  return { db: mockDb, calls };
};

describe('disputeHandler - handleChargeDispute', () => {
  describe('charge.dispute.created', () => {
    it('creates critical inbox item and records event', async () => {
      const { db, calls } = createMockEnv();

      const event: StripeEvent = {
        id: 'evt_dispute_new',
        type: 'charge.dispute.created'
      };

      const result = await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_100',
          charge: 'ch_100',
          payment_intent: null,
          amount: 5000,
          currency: 'jpy',
          reason: 'fraudulent',
          status: 'needs_response'
        }
      );

      expect(result).toEqual({ received: true });

      const eventInsert = calls.find(
        (c) => c.sql.includes('INSERT INTO events') && c.bind[0] === 'charge.dispute.created'
      );
      expect(eventInsert).toBeDefined();
      const eventPayload = JSON.parse(eventInsert?.bind[1] as string);
      expect(eventPayload.dispute_id).toBe('dp_100');
      expect(eventPayload.charge_id).toBe('ch_100');
      expect(eventPayload.amount).toBe(5000);
      expect(eventPayload.reason).toBe('fraudulent');

      const inboxInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert).toBeDefined();
      expect(inboxInsert?.bind[0]).toContain('Chargeback Received');
      expect(inboxInsert?.bind[0]).toContain('Charge ch_100');
    });

    it('looks up order via payment_intent and includes in title', async () => {
      const { db, calls } = createMockEnv();
      db._payments.set('pi_dispute_order', { order_id: 42 });

      const event: StripeEvent = {
        id: 'evt_dispute_with_order',
        type: 'charge.dispute.created'
      };

      await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_200',
          charge: 'ch_200',
          payment_intent: 'pi_dispute_order',
          amount: 3000,
          currency: 'jpy',
          reason: 'product_not_received',
          status: 'needs_response'
        }
      );

      const inboxInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert?.bind[0]).toContain('Order #42');
      expect(inboxInsert?.bind[0]).not.toContain('Charge ch_200');

      const bodyJson = JSON.parse(inboxInsert?.bind[1] as string);
      expect(bodyJson.orderId).toBe(42);
      expect(bodyJson.disputeId).toBe('dp_200');
    });

    it('falls back to charge ID when no payment_intent', async () => {
      const { db, calls } = createMockEnv();

      const event: StripeEvent = {
        id: 'evt_dispute_no_pi',
        type: 'charge.dispute.created'
      };

      await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_300',
          charge: 'ch_300',
          amount: 2000,
          currency: 'jpy',
          reason: 'general',
          status: 'needs_response'
        }
      );

      const inboxInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert?.bind[0]).toContain('Charge ch_300');
      expect(inboxInsert?.bind[0]).not.toContain('Order');
    });

    it('records event with orderId null when payment_intent not found', async () => {
      const { db, calls } = createMockEnv();

      const event: StripeEvent = {
        id: 'evt_dispute_no_match',
        type: 'charge.dispute.created'
      };

      await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_400',
          charge: 'ch_400',
          payment_intent: 'pi_unknown',
          amount: 1000,
          currency: 'jpy',
          reason: 'duplicate',
          status: 'needs_response'
        }
      );

      const eventInsert = calls.find(
        (c) => c.sql.includes('INSERT INTO events')
      );
      const eventPayload = JSON.parse(eventInsert?.bind[1] as string);
      expect(eventPayload.order_id).toBeNull();
    });
  });

  describe('charge.dispute.updated', () => {
    it('creates inbox item with updated title and status', async () => {
      const { db, calls } = createMockEnv();

      const event: StripeEvent = {
        id: 'evt_dispute_update',
        type: 'charge.dispute.updated'
      };

      await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_500',
          charge: 'ch_500',
          amount: 7000,
          currency: 'jpy',
          reason: 'product_not_received',
          status: 'under_review'
        }
      );

      const inboxInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert?.bind[0]).toContain('Chargeback Updated');
      expect(inboxInsert?.bind[0]).toContain('under_review');
    });

    it('includes order ID in updated title when available', async () => {
      const { db, calls } = createMockEnv();
      db._payments.set('pi_update_order', { order_id: 55 });

      const event: StripeEvent = {
        id: 'evt_dispute_update_order',
        type: 'charge.dispute.updated'
      };

      await handleChargeDispute(
        { DB: db } as any,
        event,
        {
          id: 'dp_600',
          charge: 'ch_600',
          payment_intent: 'pi_update_order',
          amount: 4000,
          currency: 'jpy',
          reason: 'fraudulent',
          status: 'won'
        }
      );

      const inboxInsert = calls.find((c) =>
        c.sql.includes('INSERT INTO inbox_items')
      );
      expect(inboxInsert?.bind[0]).toContain('Order #55');
      expect(inboxInsert?.bind[0]).toContain('won');
    });
  });

  it('uses default values for missing currency, reason, status', async () => {
    const { db, calls } = createMockEnv();

    const event: StripeEvent = {
      id: 'evt_dispute_defaults',
      type: 'charge.dispute.created'
    };

    await handleChargeDispute(
      { DB: db } as any,
      event,
      {
        id: 'dp_700',
        charge: 'ch_700',
        amount: 1500
      }
    );

    const eventInsert = calls.find(
      (c) => c.sql.includes('INSERT INTO events')
    );
    const eventPayload = JSON.parse(eventInsert?.bind[1] as string);
    expect(eventPayload.currency).toBe('jpy');
    expect(eventPayload.reason).toBe('unknown');
    expect(eventPayload.status).toBe('needs_response');
  });

  it('records stripeEventId in inbox body', async () => {
    const { db, calls } = createMockEnv();

    const event: StripeEvent = {
      id: 'evt_dispute_meta',
      type: 'charge.dispute.created'
    };

    await handleChargeDispute(
      { DB: db } as any,
      event,
      {
        id: 'dp_800',
        charge: 'ch_800',
        amount: 2500,
        currency: 'usd',
        reason: 'subscription_canceled',
        status: 'needs_response'
      }
    );

    const inboxInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO inbox_items')
    );
    const bodyJson = JSON.parse(inboxInsert?.bind[1] as string);
    expect(bodyJson.stripeEventId).toBe('evt_dispute_meta');
    expect(bodyJson.eventType).toBe('charge.dispute.created');
    expect(bodyJson.disputeStatus).toBe('needs_response');
    expect(bodyJson.currency).toBe('usd');
  });
});
