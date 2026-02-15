type Bindings = {
  DB: D1Database;
};

type LowStockItem = {
  variant_id: number;
  on_hand: number;
  threshold: number;
  variant_title: string | null;
  product_title: string | null;
};

/**
 * Check inventory levels against thresholds and create inbox items
 * for variants that are below their configured threshold.
 *
 * Frequency control: max 1 alert per variant per day (using inbox_items kind+date unique constraint).
 */
export const checkInventoryAlerts = async (
  env: Bindings,
  date: string
): Promise<{ alertsCreated: number }> => {
  const res = await env.DB.prepare(
    `SELECT t.variant_id,
            COALESCE(SUM(m.delta), 0) as on_hand,
            t.threshold,
            v.title as variant_title,
            p.title as product_title
     FROM inventory_thresholds t
     LEFT JOIN inventory_movements m ON m.variant_id = t.variant_id
     LEFT JOIN variants v ON v.id = t.variant_id
     LEFT JOIN products p ON p.id = v.product_id
     GROUP BY t.variant_id
     HAVING on_hand < t.threshold`
  ).all<LowStockItem>();

  const items = res.results || [];
  let alertsCreated = 0;

  for (const item of items) {
    const created = await createInventoryAlert(env, item, date);
    if (created) {
      alertsCreated += 1;
    }
  }

  return { alertsCreated };
};

const createInventoryAlert = async (
  env: Bindings,
  item: LowStockItem,
  date: string
): Promise<boolean> => {
  const productName = [item.product_title, item.variant_title]
    .filter(Boolean)
    .join(' - ') || `Variant #${item.variant_id}`;

  const severity = item.on_hand <= 0 ? 'critical' : 'warning';
  const kind = `inventory_low_${item.variant_id}`;
  const title = `在庫不足: ${productName} (残${item.on_hand}/${item.threshold})`;
  const body = JSON.stringify({
    variant_id: item.variant_id,
    on_hand: item.on_hand,
    threshold: item.threshold,
    product_title: item.product_title,
    variant_title: item.variant_title,
  });

  try {
    await env.DB.prepare(
      `INSERT INTO inbox_items (title, body, severity, status, kind, date, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'))`
    ).bind(title, body, severity, kind, date).run();
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // UNIQUE constraint on (kind, date) = frequency control: max 1 per variant per day
    if (message.includes('UNIQUE constraint failed')) {
      return false;
    }
    throw err;
  }
};
