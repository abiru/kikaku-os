import { computeStripeSignature } from '../../../lib/stripe';

export type MockDbOptions = {
  duplicatePayment?: boolean;
  duplicateRefund?: boolean;
  existingPayments?: Array<{ providerPaymentId: string; id?: number; orderId?: number | null }>;
  orderStatus?: string;
  orderTotal?: number;
  orders?: Array<{
    id: number;
    status?: string;
    total_net?: number;
    currency?: string;
    provider_checkout_session_id?: string | null;
    provider_payment_intent_id?: string | null;
    paid_at?: string | null;
    updated_at?: string | null;
    refunded_amount?: number;
    refund_count?: number;
  }>;
};

export const createMockDb = (options?: MockDbOptions) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const fulfillments = new Map<number, number>();
  const orders = new Map<number, {
    id: number;
    status: string;
    total_net: number;
    currency: string;
    provider_checkout_session_id: string | null;
    provider_payment_intent_id: string | null;
    paid_at: string | null;
    updated_at: string | null;
    refunded_amount: number;
    refund_count: number;
  }>();
  const orderStatusHistory: Array<{
    id: number;
    order_id: number;
    old_status: string;
    new_status: string;
    reason: string;
    stripe_event_id: string;
  }> = [];
  let orderStatusHistoryId = 0;
  const payments: Array<{
    id: number;
    order_id: number | null;
    provider_payment_id: string;
    amount: number;
    currency: string;
  }> = [];
  const paymentsByProviderId = new Map<string, { id: number; order_id: number | null }>();
  const refunds: Array<{
    id: number;
    payment_id: number | null;
    provider_refund_id: string;
    amount: number;
    currency: string;
  }> = [];
  const refundsByProviderId = new Map<string, { id: number }>();
  const events = new Set<string>();
  const stripeEvents = new Map<string, {
    event_id: string;
    event_type: string;
    event_created: number | null;
    payload_json: string;
    processing_status: string;
    error: string | null;
    received_at: string;
    processed_at: string | null;
  }>();
  let fulfillmentId = 0;
  let paymentId = 1000;
  let refundId = 2000;
  let nowCounter = 0;
  const orderStatus = options?.orderStatus ?? 'paid';
  const orderTotal = options?.orderTotal ?? 2500;

  for (const payment of options?.existingPayments ?? []) {
    const id = payment.id ?? ++paymentId;
    const orderId = payment.orderId ?? null;
    payments.push({
      id,
      order_id: orderId,
      provider_payment_id: payment.providerPaymentId,
      amount: orderTotal,
      currency: 'JPY'
    });
    paymentsByProviderId.set(payment.providerPaymentId, { id, order_id: orderId });
  }

  for (const order of options?.orders ?? []) {
    orders.set(order.id, {
      id: order.id,
      status: order.status ?? orderStatus,
      total_net: order.total_net ?? orderTotal,
      currency: order.currency ?? 'JPY',
      provider_checkout_session_id: order.provider_checkout_session_id ?? null,
      provider_payment_intent_id: order.provider_payment_intent_id ?? null,
      paid_at: order.paid_at ?? null,
      updated_at: order.updated_at ?? null,
      refunded_amount: order.refunded_amount ?? 0,
      refund_count: order.refund_count ?? 0
    });
  }

  const nextNow = () => {
    nowCounter += 1;
    return `mock-now-${nowCounter}`;
  };

  const getOrCreateOrder = (orderId: number) => {
    const existing = orders.get(orderId);
    if (existing) return existing;
    const created = {
      id: orderId,
      status: orderStatus,
      total_net: orderTotal,
      currency: 'JPY',
      provider_checkout_session_id: null,
      provider_payment_intent_id: null,
      paid_at: null,
      updated_at: null,
      refunded_amount: 0,
      refund_count: 0
    };
    orders.set(orderId, created);
    return created;
  };

  const findPaymentByOrderId = (orderId: number) => {
    const matches = payments.filter((payment) => payment.order_id === orderId);
    return matches.length > 0 ? matches[matches.length - 1] : null;
  };

  return {
    calls,
    state: {
      orders,
      payments,
      refunds,
      events,
      stripeEvents,
      orderStatusHistory
    },
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT id, total_net, status, refunded_amount FROM orders')) {
            const id = Number(args[0]);
            if (!Number.isFinite(id)) return null;
            const order = getOrCreateOrder(id);
            return {
              id: order.id,
              total_net: order.total_net,
              status: order.status,
              refunded_amount: order.refunded_amount
            };
          }
          if (sql.includes('SELECT refund_count FROM orders')) {
            const id = Number(args[0]);
            if (!Number.isFinite(id)) return null;
            const order = getOrCreateOrder(id);
            return { refund_count: order.refund_count };
          }
          if (sql.includes('SELECT id, total_net, status FROM orders')) {
            const id = Number(args[0]);
            if (!Number.isFinite(id)) return null;
            const order = getOrCreateOrder(id);
            return { id: order.id, total_net: order.total_net, status: order.status };
          }
          if (sql.includes('SELECT id FROM orders')) {
            const id = Number(args[0]);
            if (!Number.isFinite(id)) return null;
            const order = getOrCreateOrder(id);
            return { id: order.id };
          }
          if (sql.includes('SELECT id, order_id FROM payments WHERE provider_payment_id')) {
            const payment = paymentsByProviderId.get(String(args[0]));
            return payment ? { id: payment.id, order_id: payment.order_id } : null;
          }
          if (sql.includes('SELECT id, order_id FROM payments WHERE order_id')) {
            const payment = findPaymentByOrderId(Number(args[0]));
            return payment ? { id: payment.id, order_id: payment.order_id } : null;
          }
          if (sql.includes('SELECT id FROM payments WHERE provider_payment_id')) {
            const payment = paymentsByProviderId.get(String(args[0]));
            return payment ? { id: payment.id } : null;
          }
          if (sql.includes('SELECT id FROM refunds')) {
            const refund = refundsByProviderId.get(String(args[0]));
            return refund ? { id: refund.id } : null;
          }
          if (sql.includes('SELECT id FROM fulfillments')) {
            const orderId = Number(args[0]);
            const existingId = fulfillments.get(orderId);
            return existingId ? { id: existingId } : null;
          }
          return null;
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO stripe_events')) {
            const eventId = String(args[0]);
            if (stripeEvents.has(eventId)) {
              throw new Error('UNIQUE constraint failed: stripe_events.event_id');
            }
            stripeEvents.set(eventId, {
              event_id: eventId,
              event_type: String(args[1]),
              event_created: typeof args[2] === 'number' ? args[2] : null,
              payload_json: String(args[3]),
              processing_status: 'pending',
              error: null,
              received_at: nextNow(),
              processed_at: null
            });
          }
          if (sql.includes('UPDATE stripe_events')) {
            const status = String(args[0]);
            const error = args[1] != null ? String(args[1]) : null;
            const eventId = String(args[2]);
            const existing = stripeEvents.get(eventId);
            if (existing) {
              existing.processing_status = status;
              existing.error = error;
              existing.processed_at = nextNow();
            }
          }
          if (sql.includes('INSERT INTO events')) {
            const eventId = String(args[1]);
            if (events.has(eventId)) {
              throw new Error('UNIQUE constraint failed: events.stripe_event_id');
            }
            events.add(eventId);
          }
          if (sql.includes("UPDATE orders") && sql.includes("status='paid'")) {
            if (sql.includes('provider_checkout_session_id')) {
              const sessionId = args[0] as string | null;
              const paymentIntentId = args[1] as string | null;
              const orderId = Number(args[2]);
              const order = getOrCreateOrder(orderId);
              order.status = 'paid';
              if (!order.provider_checkout_session_id && sessionId) {
                order.provider_checkout_session_id = sessionId;
              }
              if (!order.provider_payment_intent_id && paymentIntentId) {
                order.provider_payment_intent_id = paymentIntentId;
              }
              if (!order.paid_at) order.paid_at = nextNow();
              order.updated_at = nextNow();
            } else {
              const providerPaymentId = args[0] as string | null;
              const orderId = Number(args[1]);
              const order = getOrCreateOrder(orderId);
              order.status = 'paid';
              if (!order.provider_payment_intent_id && providerPaymentId) {
                order.provider_payment_intent_id = providerPaymentId;
              }
              if (!order.paid_at) order.paid_at = nextNow();
              order.updated_at = nextNow();
            }
          }
          if (sql.includes('UPDATE orders SET status=?, refunded_amount=?, refund_count=?')) {
            const newStatus = String(args[0]);
            const newRefundedAmount = Number(args[1]);
            const newRefundCount = Number(args[2]);
            const orderId = Number(args[3]);
            const order = getOrCreateOrder(orderId);
            order.status = newStatus;
            order.refunded_amount = newRefundedAmount;
            order.refund_count = newRefundCount;
            order.updated_at = nextNow();
          } else if (sql.includes('UPDATE orders SET status=?')) {
            const newStatus = String(args[0]);
            const orderId = Number(args[1]);
            const order = getOrCreateOrder(orderId);
            order.status = newStatus;
            order.updated_at = nextNow();
          }
          if (sql.includes('INSERT INTO payments') && options?.duplicatePayment) {
            throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
          }
          if (sql.includes('INSERT INTO payments')) {
            const providerPaymentId = String(args[3]);
            if (paymentsByProviderId.has(providerPaymentId)) {
              throw new Error('UNIQUE constraint failed: payments.provider_payment_id');
            }
            paymentId += 1;
            const orderId = Number(args[0]) || null;
            payments.push({
              id: paymentId,
              order_id: orderId,
              provider_payment_id: providerPaymentId,
              amount: Number(args[1]) || 0,
              currency: String(args[2] || 'JPY')
            });
            paymentsByProviderId.set(providerPaymentId, { id: paymentId, order_id: orderId });
          }
          if (sql.includes('INSERT INTO refunds')) {
            const paymentIdValue = typeof args[0] === 'number' ? args[0] : null;
            const amountValue = Number(args[1]);
            const currencyValue = String(args[2] ?? 'JPY').toUpperCase();
            const providerRefundId = String(args[3]);
            const metadataValue = args[4];

            if (options?.duplicateRefund || refundsByProviderId.has(providerRefundId)) {
              throw new Error('UNIQUE constraint failed: refunds.provider_refund_id');
            }

            refundId += 1;
            refunds.push({
              id: refundId,
              payment_id: paymentIdValue,
              provider_refund_id: providerRefundId,
              amount: amountValue,
              currency: currencyValue
            });
            refundsByProviderId.set(providerRefundId, { id: refundId });

            return { success: true };
          }
          if (sql.includes('INSERT INTO fulfillments')) {
            const orderId = Number(args[0]);
            if (!fulfillments.has(orderId)) {
              fulfillmentId += 1;
              fulfillments.set(orderId, fulfillmentId);
            }
          }
          if (sql.includes('INSERT INTO order_status_history')) {
            orderStatusHistoryId += 1;
            orderStatusHistory.push({
              id: orderStatusHistoryId,
              order_id: Number(args[0]),
              old_status: String(args[1]),
              new_status: String(args[2]),
              reason: String(args[3]),
              stripe_event_id: String(args[4])
            });
          }
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

export const buildStripeSignatureHeader = async (payload: string, secret: string, timestamp?: string) => {
  const signedAt = timestamp ?? String(Math.floor(Date.now() / 1000));
  const sig = await computeStripeSignature(payload, secret, signedAt);
  return `t=${signedAt},v1=${sig}`;
};
