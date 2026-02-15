/**
 * Stripe Data Access and Event Parsing Utilities
 *
 * This module handles:
 * - Stripe event recording and status tracking
 * - Payment and refund record insertion
 * - Order ID extraction and normalization
 * - Payment method extraction from Stripe events
 */

import type { Env } from '../env';

/**
 * Stripe webhook data object type
 * Uses Record<string, unknown> as base since we don't import @stripe/stripe-js server-side types.
 * Common Stripe fields are declared explicitly for type-safe access.
 */
export type StripeDataObject = Record<string, unknown> & {
  id?: string;
  metadata?: Record<string, string> | null;
  currency?: string;
  amount?: number;
  amount_total?: number;
  amount_subtotal?: number;
  amount_received?: number;
  amount_refunded?: number;
  payment_intent?: string;
  payment_intent_id?: string;
  status?: string;
  next_action?: Record<string, unknown> & {
    display_bank_transfer_instructions?: unknown;
  };
};

/**
 * Stripe event type for parsing
 */
export type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data?: { object?: StripeDataObject };
};

/**
 * Refund data extracted from Stripe events
 */
export type RefundData = {
  refundId: string;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  metadataOrderId: number | null;
  stripeReason: string | null;
  receiptNumber: string | null;
  status: string;
};

/**
 * Normalizes a value to a finite positive number
 * Returns null if the value is not a valid order ID
 */
export const normalizeOrderId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

/**
 * Extracts order ID from Stripe metadata
 * Supports both camelCase (orderId) and snake_case (order_id) formats
 */
export const extractOrderId = (metadata: Record<string, string> | null | undefined): number | null =>
  normalizeOrderId(metadata?.orderId ?? metadata?.order_id);

/**
 * Records a Stripe event in the database for idempotency tracking
 * Stores both in stripe_events (for idempotency) and events (for audit trail)
 *
 * Returns { inserted: true, duplicate: false } on success
 * Returns { inserted: false, duplicate: true } if event already exists
 * Throws on other errors
 */
export const recordStripeEvent = async (
  env: Env['Bindings'],
  event: StripeEvent,
  rawPayload: string
): Promise<{ inserted: boolean; duplicate: boolean }> => {
  try {
    // Phase 1: stripe_events에 완전한 페이로드를 저장（冪等性チェックの核）
    await env.DB.prepare(
      `INSERT INTO stripe_events (event_id, event_type, event_created, payload_json, processing_status, received_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
    )
      .bind(event.id, event.type, event.created ?? null, rawPayload)
      .run();

    // eventsテーブルにも簡易記録（監査ログとして）
    await env.DB.prepare(
      `INSERT INTO events (type, payload, stripe_event_id, created_at)
       VALUES ('stripe_webhook', ?, ?, datetime('now'))`
    )
      .bind(
        JSON.stringify({ id: event.id, type: event.type }),
        event.id
      )
      .run();

    return { inserted: true, duplicate: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
};

/**
 * Updates the processing status of a recorded Stripe event
 * Marks event as completed or failed with optional error message
 */
export const updateStripeEventStatus = async (
  env: Env['Bindings'],
  eventId: string,
  status: 'completed' | 'failed',
  error?: string
): Promise<void> => {
  await env.DB.prepare(
    `UPDATE stripe_events
     SET processing_status = ?, error = ?, processed_at = datetime('now')
     WHERE event_id = ?`
  )
    .bind(status, error ?? null, eventId)
    .run();
};

/**
 * Inserts a payment record into the database
 * Idempotent: returns duplicate flag if payment already exists
 */
export const insertPayment = async (
  env: Env['Bindings'],
  payload: {
    orderId: number | null;
    amount: number;
    currency: string;
    method: string;
    providerPaymentId: string;
    eventId: string;
  }
): Promise<{ inserted: boolean; duplicate: boolean }> => {
  try {
    await env.DB.prepare(
      `INSERT INTO payments (order_id, status, amount, fee, currency, method, provider, provider_payment_id, metadata, created_at, updated_at)
       VALUES (?, 'succeeded', ?, 0, ?, ?, 'stripe', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        payload.orderId,
        payload.amount,
        payload.currency,
        payload.method,
        payload.providerPaymentId,
        JSON.stringify({ stripe_event: payload.eventId })
      )
      .run();
    return { inserted: true, duplicate: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
};

/**
 * Maps Stripe refund reason to local reason code
 */
const mapStripeReasonToLocal = (stripeReason: string | null): string => {
  if (!stripeReason) return 'stripe_refund';

  const reasonMap: Record<string, string> = {
    'duplicate': 'duplicate_charge',
    'fraudulent': 'fraud',
    'requested_by_customer': 'customer_request',
    'expired_uncaptured_charge': 'expired',
  };

  return reasonMap[stripeReason] || stripeReason;
};

/**
 * Inserts a refund record into the database
 * Idempotent: returns duplicate flag if refund already exists
 *
 * Stores both Stripe-specific metadata (reason, receipt_number) and
 * mapped local reason code for internal use
 */
export const insertRefundRecord = async (
  env: Env['Bindings'],
  refund: RefundData,
  paymentId: number | null,
  eventId: string
): Promise<{ inserted: boolean; duplicate: boolean }> => {
  try {
    await env.DB.prepare(
      `INSERT INTO refunds (
         payment_id, status, amount, currency, reason,
         provider_refund_id, stripe_reason, receipt_number,
         metadata, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        paymentId,
        refund.status,
        refund.amount,
        refund.currency,
        mapStripeReasonToLocal(refund.stripeReason),
        refund.refundId,
        refund.stripeReason,
        refund.receiptNumber,
        JSON.stringify({ stripe_event: eventId })
      )
      .run();
    return { inserted: true, duplicate: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint failed')) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
};

/**
 * Extracts refund data from Stripe event
 * Handles both charge.refunded (multiple refunds) and refund.* events (single refund)
 */
export const extractRefundsFromEvent = (
  eventType: string,
  dataObject: StripeDataObject
): RefundData[] => {
  const refundsData = dataObject.refunds as { data?: unknown[] } | undefined;
  const rawRefunds: StripeDataObject[] =
    eventType === 'charge.refunded'
      ? Array.isArray(refundsData?.data)
        ? (refundsData.data as StripeDataObject[])
        : []
      : dataObject?.id
        ? [dataObject]
        : [];

  return rawRefunds
    .filter((refund: StripeDataObject) => refund?.id)
    .map((refund: StripeDataObject) => ({
      refundId: refund.id as string,
      amount:
        (refund.amount as number) ||
        (dataObject.amount_refunded as number) ||
        (dataObject.amount as number) ||
        0,
      currency: (
        ((refund.currency as string) ||
          (dataObject.currency as string) ||
          'jpy')
      ).toUpperCase(),
      paymentIntentId:
        (refund.payment_intent as string) ||
        (refund.payment_intent_id as string) ||
        (dataObject.payment_intent as string) ||
        (dataObject.payment_intent_id as string) ||
        null,
      metadataOrderId: extractOrderId(
        (refund.metadata as Record<string, string> | null | undefined) ??
        dataObject.metadata
      ),
      stripeReason: (refund.reason as string) || null,
      receiptNumber: (refund.receipt_number as string) || null,
      status: (refund.status as string) || 'succeeded'
    }));
};

/**
 * Finds the payment record associated with a refund
 * Searches by payment_intent_id first, then falls back to order_id
 */
export const findPaymentForRefund = async (
  env: Env['Bindings'],
  paymentIntentId: string | null,
  metadataOrderId: number | null
): Promise<{ id: number; order_id: number | null } | null> => {
  if (paymentIntentId) {
    const paymentByIntent = await env.DB.prepare(
      `SELECT id, order_id FROM payments WHERE provider_payment_id=?`
    )
      .bind(paymentIntentId)
      .first<{ id: number; order_id: number | null }>();

    if (paymentByIntent?.id) {
      return paymentByIntent;
    }
  }

  if (metadataOrderId) {
    return await env.DB.prepare(
      `SELECT id, order_id FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1`
    )
      .bind(metadataOrderId)
      .first<{ id: number; order_id: number | null }>();
  }

  return null;
};

/**
 * Extracts payment method type from Stripe event data
 * Returns 'card', 'customer_balance', or other method type
 *
 * Priority:
 * 1. Actual payment method used (from charges[0].payment_method_details.type)
 * 2. Available payment method types (from payment_method_types array)
 * 3. Fallback to 'card' for backward compatibility
 */
export const extractPaymentMethod = (dataObject: StripeDataObject): string => {
  // CRITICAL: Check ACTUAL payment method used first (from charges)
  // This is what the customer actually selected, not what was available
  const charges = dataObject.charges as { data?: Array<{ payment_method_details?: { type?: string } }> } | undefined;
  if (charges?.data?.[0]?.payment_method_details?.type) {
    return charges.data[0].payment_method_details.type;
  }

  // Fallback: Check payment_method_types array (what was available)
  // Only used if charges data is not available (e.g., early webhook events)
  if (dataObject.payment_method_types) {
    const types = dataObject.payment_method_types;
    if (Array.isArray(types) && types.length > 0) {
      // Return first available type (will be 'card' when both are enabled)
      return types[0] as string;
    }
  }

  // Final fallback to card for backward compatibility
  return 'card';
};
