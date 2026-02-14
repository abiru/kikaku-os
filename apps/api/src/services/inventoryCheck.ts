/**
 * Inventory Check Service
 *
 * Provides stock availability checks and movement operations
 * for the checkout flow. Uses movement-based inventory tracking.
 */

type StockResult = {
  variantId: number;
  onHand: number;
};

/**
 * Get available stock for a single variant
 * Calculates current stock as SUM of all inventory_movements.delta
 */
export const getAvailableStock = async (
  db: D1Database,
  variantId: number
): Promise<number> => {
  const result = await db.prepare(
    `SELECT COALESCE(SUM(delta), 0) as on_hand
     FROM inventory_movements
     WHERE variant_id = ?`
  ).bind(variantId).first<{ on_hand: number }>();

  return result?.on_hand ?? 0;
};

/**
 * Get available stock for multiple variants in one query
 */
export const getAvailableStockBatch = async (
  db: D1Database,
  variantIds: number[]
): Promise<Map<number, number>> => {
  if (variantIds.length === 0) return new Map();

  const placeholders = variantIds.map(() => '?').join(',');
  const results = await db.prepare(
    `SELECT variant_id, COALESCE(SUM(delta), 0) as on_hand
     FROM inventory_movements
     WHERE variant_id IN (${placeholders})
     GROUP BY variant_id`
  ).bind(...variantIds).all<StockResult>();

  const stockMap = new Map<number, number>();
  for (const row of results.results || []) {
    stockMap.set(row.variantId, row.onHand);
  }

  // Variants with no movements have 0 stock
  for (const id of variantIds) {
    if (!stockMap.has(id)) {
      stockMap.set(id, 0);
    }
  }

  return stockMap;
};

type StockCheckItem = {
  variantId: number;
  quantity: number;
};

type StockCheckResult = {
  available: boolean;
  insufficientItems: Array<{
    variantId: number;
    requested: number;
    available: number;
  }>;
};

/**
 * Check if all items have sufficient stock
 * Returns detailed info about any insufficient items
 */
export const checkStockAvailability = async (
  db: D1Database,
  items: StockCheckItem[]
): Promise<StockCheckResult> => {
  const variantIds = items.map((i) => i.variantId);
  const stockMap = await getAvailableStockBatch(db, variantIds);

  const insufficientItems: StockCheckResult['insufficientItems'] = [];

  for (const item of items) {
    const onHand = stockMap.get(item.variantId) ?? 0;
    if (onHand < item.quantity) {
      insufficientItems.push({
        variantId: item.variantId,
        requested: item.quantity,
        available: onHand
      });
    }
  }

  return {
    available: insufficientItems.length === 0,
    insufficientItems
  };
};

/**
 * Record inventory deduction for a completed sale
 * Creates negative delta movements for each item
 */
export const deductStockForOrder = async (
  db: D1Database,
  orderId: number,
  items: StockCheckItem[]
): Promise<void> => {
  for (const item of items) {
    await db.prepare(
      `INSERT INTO inventory_movements (variant_id, delta, reason, metadata, created_at, updated_at)
       VALUES (?, ?, 'sale', ?, datetime('now'), datetime('now'))`
    ).bind(
      item.variantId,
      -item.quantity,
      JSON.stringify({ order_id: orderId })
    ).run();
  }
};
