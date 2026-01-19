/**
 * Extended anomaly detection rules for Inbox
 * - Inventory: low stock, negative stock, excessive adjustments
 * - Sales: high refund rate, webhook failures, unfulfilled orders
 */

type Bindings = {
  DB: D1Database;
};

type AnomalyResult = {
  created: boolean;
  kind: string;
  date: string;
};

/**
 * Helper to insert inbox item with deduplication (kind + date unique constraint)
 */
const insertInboxItem = async (
  env: Bindings,
  params: {
    title: string;
    body: string;
    severity: 'info' | 'warning' | 'critical';
    kind: string;
    date: string;
  }
): Promise<boolean> => {
  try {
    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, date, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'))`
    ).bind(params.title, params.body, params.severity, params.kind, params.date).run();
    return true;
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) return false;
    throw err;
  }
};

// =============================================================================
// INVENTORY ANOMALIES
// =============================================================================

/**
 * Detect variants with stock below threshold (improved with deduplication)
 */
export const detectLowStock = async (env: Bindings, date: string): Promise<AnomalyResult[]> => {
  const results: AnomalyResult[] = [];

  const res = await env.DB.prepare(`
    SELECT v.id as variant_id, v.title as variant_title, p.title as product_title,
           COALESCE(SUM(m.delta), 0) as on_hand, t.threshold
    FROM inventory_thresholds t
    JOIN variants v ON v.id = t.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory_movements m ON m.variant_id = t.variant_id
    GROUP BY t.variant_id
    HAVING on_hand < t.threshold AND on_hand >= 0
  `).all<{
    variant_id: number;
    variant_title: string;
    product_title: string;
    on_hand: number;
    threshold: number;
  }>();

  for (const row of res.results || []) {
    const kind = `low_stock_${row.variant_id}`;
    const created = await insertInboxItem(env, {
      title: `Low Stock: ${row.product_title} - ${row.variant_title}`,
      body: JSON.stringify({
        variant_id: row.variant_id,
        variant_title: row.variant_title,
        product_title: row.product_title,
        on_hand: row.on_hand,
        threshold: row.threshold,
        shortfall: row.threshold - row.on_hand
      }),
      severity: 'warning',
      kind,
      date
    });
    results.push({ created, kind, date });
  }

  return results;
};

/**
 * Detect variants with negative stock (data integrity issue)
 */
export const detectNegativeStock = async (env: Bindings, date: string): Promise<AnomalyResult[]> => {
  const results: AnomalyResult[] = [];

  const res = await env.DB.prepare(`
    SELECT v.id as variant_id, v.title as variant_title, p.title as product_title,
           COALESCE(SUM(m.delta), 0) as on_hand
    FROM variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory_movements m ON m.variant_id = v.id
    GROUP BY v.id
    HAVING on_hand < 0
  `).all<{
    variant_id: number;
    variant_title: string;
    product_title: string;
    on_hand: number;
  }>();

  for (const row of res.results || []) {
    const kind = `negative_stock_${row.variant_id}`;
    const created = await insertInboxItem(env, {
      title: `Negative Stock: ${row.product_title} - ${row.variant_title}`,
      body: JSON.stringify({
        variant_id: row.variant_id,
        variant_title: row.variant_title,
        product_title: row.product_title,
        on_hand: row.on_hand
      }),
      severity: 'critical',
      kind,
      date
    });
    results.push({ created, kind, date });
  }

  return results;
};

// =============================================================================
// SALES ANOMALIES
// =============================================================================

/**
 * Detect days with high refund rate (> 30% of daily sales)
 */
export const detectHighRefundRate = async (env: Bindings, date: string): Promise<AnomalyResult | null> => {
  const res = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_net ELSE 0 END), 0) as order_total,
      COALESCE((
        SELECT SUM(r.amount)
        FROM refunds r
        JOIN payments p ON p.id = r.payment_id
        WHERE date(r.created_at) = ?
      ), 0) as refund_total
    FROM orders o
    WHERE date(o.paid_at) = ?
  `).bind(date, date).first<{ order_total: number; refund_total: number }>();

  if (!res) return null;

  const { order_total, refund_total } = res;
  if (order_total === 0) return null;

  const refundRate = refund_total / order_total;
  const THRESHOLD = 0.3; // 30%

  if (refundRate <= THRESHOLD) return null;

  const kind = 'high_refund_rate';
  const created = await insertInboxItem(env, {
    title: `High Refund Rate: ${(refundRate * 100).toFixed(1)}% on ${date}`,
    body: JSON.stringify({
      date,
      order_total,
      refund_total,
      refund_rate: refundRate,
      threshold: THRESHOLD
    }),
    severity: refundRate > 0.5 ? 'critical' : 'warning',
    kind,
    date
  });

  return { created, kind, date };
};

/**
 * Detect Stripe webhook processing failures
 */
export const detectWebhookFailures = async (env: Bindings, date: string): Promise<AnomalyResult | null> => {
  const res = await env.DB.prepare(`
    SELECT COUNT(*) as failure_count,
           GROUP_CONCAT(event_id) as event_ids,
           GROUP_CONCAT(DISTINCT event_type) as event_types
    FROM stripe_events
    WHERE date(received_at) = ?
      AND processing_status = 'failed'
  `).bind(date).first<{
    failure_count: number;
    event_ids: string | null;
    event_types: string | null;
  }>();

  if (!res || res.failure_count === 0) return null;

  const kind = 'webhook_failures';
  const created = await insertInboxItem(env, {
    title: `Stripe Webhook Failures: ${res.failure_count} on ${date}`,
    body: JSON.stringify({
      date,
      failure_count: res.failure_count,
      event_ids: res.event_ids?.split(',').slice(0, 10) || [],
      event_types: res.event_types?.split(',') || []
    }),
    severity: res.failure_count > 5 ? 'critical' : 'warning',
    kind,
    date
  });

  return { created, kind, date };
};

/**
 * Detect paid orders without fulfillment for more than N days
 */
export const detectUnfulfilledOrders = async (
  env: Bindings,
  date: string,
  daysThreshold: number = 3
): Promise<AnomalyResult | null> => {
  const res = await env.DB.prepare(`
    SELECT o.id as order_id, o.customer_id, c.email as customer_email,
           o.total_net, o.currency, o.paid_at,
           julianday(?) - julianday(o.paid_at) as days_since_paid
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN fulfillments f ON f.order_id = o.id
    WHERE o.status = 'paid'
      AND o.paid_at IS NOT NULL
      AND julianday(?) - julianday(o.paid_at) > ?
      AND (f.id IS NULL OR f.status = 'pending')
    ORDER BY o.paid_at ASC
    LIMIT 50
  `).bind(date, date, daysThreshold).all<{
    order_id: number;
    customer_id: number | null;
    customer_email: string | null;
    total_net: number;
    currency: string;
    paid_at: string;
    days_since_paid: number;
  }>();

  const orders = res.results || [];
  if (orders.length === 0) return null;

  const kind = 'unfulfilled_orders';
  const created = await insertInboxItem(env, {
    title: `Unfulfilled Orders: ${orders.length} orders pending > ${daysThreshold} days`,
    body: JSON.stringify({
      date,
      days_threshold: daysThreshold,
      order_count: orders.length,
      orders: orders.map((o) => ({
        order_id: o.order_id,
        customer_email: o.customer_email,
        total_net: o.total_net,
        currency: o.currency,
        paid_at: o.paid_at,
        days_since_paid: Math.floor(o.days_since_paid)
      }))
    }),
    severity: orders.length > 5 ? 'critical' : 'warning',
    kind,
    date
  });

  return { created, kind, date };
};

// =============================================================================
// MAIN RUNNER
// =============================================================================

export type AnomalyRunResult = {
  date: string;
  lowStock: AnomalyResult[];
  negativeStock: AnomalyResult[];
  highRefundRate: AnomalyResult | null;
  webhookFailures: AnomalyResult | null;
  unfulfilledOrders: AnomalyResult | null;
};

/**
 * Run all anomaly detection rules
 */
export const runAllAnomalyChecks = async (
  env: Bindings,
  date: string
): Promise<AnomalyRunResult> => {
  const [lowStock, negativeStock, highRefundRate, webhookFailures, unfulfilledOrders] =
    await Promise.all([
      detectLowStock(env, date),
      detectNegativeStock(env, date),
      detectHighRefundRate(env, date),
      detectWebhookFailures(env, date),
      detectUnfulfilledOrders(env, date)
    ]);

  return {
    date,
    lowStock,
    negativeStock,
    highRefundRate,
    webhookFailures,
    unfulfilledOrders
  };
};
