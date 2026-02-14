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
    `SELECT COALESCE(SUM(delta), 0) as onHand
     FROM inventory_movements
     WHERE variant_id = ?`
  ).bind(variantId).first<{ onHand: number }>();

  return result?.onHand ?? 0;
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
    `SELECT variant_id as variantId, COALESCE(SUM(delta), 0) as onHand
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

type ReservationResult = {
  reserved: boolean;
  insufficientItems: StockCheckResult['insufficientItems'];
};

const aggregateRequestedItems = (
  items: StockCheckItem[]
): Map<number, number> => {
  const requestedByVariant = new Map<number, number>();
  for (const item of items) {
    const current = requestedByVariant.get(item.variantId) ?? 0;
    requestedByVariant.set(item.variantId, current + item.quantity);
  }
  return requestedByVariant;
};

/**
 * Check if all items have sufficient stock
 * Returns detailed info about any insufficient items
 */
export const checkStockAvailability = async (
  db: D1Database,
  items: StockCheckItem[]
): Promise<StockCheckResult> => {
  const requestedByVariant = aggregateRequestedItems(items);
  const variantIds = Array.from(requestedByVariant.keys());
  const stockMap = await getAvailableStockBatch(db, variantIds);

  const insufficientItems: StockCheckResult['insufficientItems'] = [];

  for (const [variantId, requested] of requestedByVariant.entries()) {
    const onHand = stockMap.get(variantId) ?? 0;
    if (onHand < requested) {
      insufficientItems.push({
        variantId,
        requested,
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
  const requestedByVariant = aggregateRequestedItems(items);
  for (const [variantId, requested] of requestedByVariant.entries()) {
    await db.prepare(
      `INSERT INTO inventory_movements (variant_id, delta, reason, metadata, created_at, updated_at)
       VALUES (?, ?, 'sale', ?, datetime('now'), datetime('now'))`
    ).bind(
      variantId,
      -requested,
      JSON.stringify({ order_id: orderId })
    ).run();
  }
};

/**
 * Reserve stock for an order with atomic conditional inserts.
 * If any variant cannot be reserved, all reservations from this attempt are released.
 */
export const reserveStockForOrder = async (
  db: D1Database,
  orderId: number,
  items: StockCheckItem[]
): Promise<ReservationResult> => {
  const requestedByVariant = aggregateRequestedItems(items);
  const reservationId = crypto.randomUUID();

  for (const [variantId, requested] of requestedByVariant.entries()) {
    const insertResult = await db.prepare(
      `INSERT INTO inventory_movements (variant_id, delta, reason, metadata, created_at, updated_at)
       SELECT ?, ?, 'reservation', ?, datetime('now'), datetime('now')
       WHERE (SELECT COALESCE(SUM(delta), 0) FROM inventory_movements WHERE variant_id = ?) >= ?`
    ).bind(
      variantId,
      -requested,
      JSON.stringify({ order_id: orderId, reservation_id: reservationId }),
      variantId,
      requested
    ).run();

    if (!insertResult.meta.changes || insertResult.meta.changes === 0) {
      await db.prepare(
        `UPDATE inventory_movements
         SET delta = 0,
             reason = 'reservation_released',
             updated_at = datetime('now')
         WHERE reason = 'reservation'
           AND json_extract(metadata, '$.reservation_id') = ?`
      ).bind(reservationId).run();

      const available = await getAvailableStock(db, variantId);
      return {
        reserved: false,
        insufficientItems: [{ variantId, requested, available }]
      };
    }
  }

  return { reserved: true, insufficientItems: [] };
};

/**
 * Convert active reservations to finalized sales after payment succeeds.
 * Returns true when at least one reservation row was converted.
 */
export const consumeStockReservationForOrder = async (
  db: D1Database,
  orderId: number
): Promise<boolean> => {
  const result = await db.prepare(
    `UPDATE inventory_movements
     SET reason = 'sale',
         updated_at = datetime('now')
     WHERE reason = 'reservation'
       AND json_extract(metadata, '$.order_id') = ?`
  ).bind(orderId).run();

  return !!result.meta.changes && result.meta.changes > 0;
};

/**
 * Release active reservations for an order (e.g. payment failed/canceled).
 * Returns number of released reservation rows.
 */
export const releaseStockReservationForOrder = async (
  db: D1Database,
  orderId: number
): Promise<number> => {
  const result = await db.prepare(
    `UPDATE inventory_movements
     SET delta = 0,
         reason = 'reservation_released',
         updated_at = datetime('now')
     WHERE reason = 'reservation'
       AND json_extract(metadata, '$.order_id') = ?`
  ).bind(orderId).run();

  return Number(result.meta.changes || 0);
};
