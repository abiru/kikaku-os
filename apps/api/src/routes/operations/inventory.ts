import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { createMovementSchema, updateThresholdSchema, thresholdParamSchema, setThresholdSchema } from '../../lib/schemas';
import type { Env } from '../../env';
import { getActor } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';

const logger = createLogger('inventory');
const inventory = new Hono<Env>();

inventory.get('/inventory/low', async (c) => {
  const requested = Number(c.req.query('limit') || 100);
  const limit = Math.min(Math.max(requested, 1), 200);
  try {
    const res = await c.env.DB.prepare(
      `SELECT t.variant_id as variant_id,
              COALESCE(SUM(m.delta), 0) as on_hand,
              t.threshold as threshold,
              v.title as variant_title,
              p.title as product_title
       FROM inventory_thresholds t
       LEFT JOIN inventory_movements m ON m.variant_id = t.variant_id
       LEFT JOIN variants v ON v.id = t.variant_id
       LEFT JOIN products p ON p.id = v.product_id
       GROUP BY t.variant_id
       HAVING on_hand < t.threshold
       ORDER BY (t.threshold - on_hand) DESC
       LIMIT ?`
    ).bind(limit).all<{ variant_id: number; on_hand: number; threshold: number; variant_title: string | null; product_title: string | null }>();
    return jsonOk(c, { items: res.results || [] });
  } catch (err) {
    logger.error('Failed to fetch low inventory', { error: String(err) });
    return jsonError(c, 'Failed to fetch low inventory');
  }
});

inventory.post('/inventory/thresholds', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = setThresholdSchema.safeParse(raw);

    if (!parsed.success) {
      const messages = parsed.error.issues.map((e) => e.message).join(', ');
      return jsonError(c, messages, 400);
    }

    const { variant_id, threshold } = parsed.data;

    await c.env.DB.prepare(
      `INSERT INTO inventory_thresholds (variant_id, threshold, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(variant_id) DO UPDATE SET threshold=excluded.threshold, updated_at=datetime('now')`
    ).bind(variant_id, threshold).run();
    return jsonOk(c, { variant_id, threshold });
  } catch (err) {
    logger.error('Failed to upsert threshold', { error: String(err) });
    return jsonError(c, 'Failed to upsert threshold');
  }
});

// =====================
// Admin Inventory Endpoints
// =====================

// Custom error handler for zod validation (zod v4 compatible)

type InventoryRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  sku: string | null;
  on_hand: number;
  threshold: number | null;
};

// GET /admin/inventory - List all variants with on-hand quantities
inventory.get('/admin/inventory', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        v.id as variant_id,
        v.title as variant_title,
        v.product_id,
        p.title as product_title,
        v.sku,
        COALESCE(SUM(m.delta), 0) as on_hand,
        t.threshold
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN inventory_movements m ON m.variant_id = v.id
      LEFT JOIN inventory_thresholds t ON t.variant_id = v.id
      GROUP BY v.id
      ORDER BY v.id ASC
    `).all<InventoryRow>();

    const inventory = (result.results || []).map((row) => ({
      ...row,
      status:
        row.on_hand <= 0
          ? 'out'
          : row.threshold !== null && row.on_hand < row.threshold
            ? 'low'
            : 'ok',
    }));

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(getActor(c), 'view_inventory', 'admin_inventory_list', JSON.stringify({ count: inventory.length })).run();

    return jsonOk(c, { inventory, meta: { totalCount: inventory.length } });
  } catch (err) {
    logger.error('Failed to fetch inventory', { error: String(err) });
    return jsonError(c, 'Failed to fetch inventory');
  }
});

// POST /admin/inventory/movements - Record inventory movement
inventory.post(
  '/admin/inventory/movements',
  zValidator('json', createMovementSchema, validationErrorHandler),
  async (c) => {
    const { variant_id, delta, reason } = c.req.valid('json');

    try {
      // Verify variant exists
      const variant = await c.env.DB.prepare('SELECT id FROM variants WHERE id = ?').bind(variant_id).first();
      if (!variant) {
        return jsonError(c, 'Variant not found', 404);
      }

      // Prevent negative stock for outgoing movements
      if (delta < 0) {
        const currentStock = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(delta), 0) as on_hand FROM inventory_movements WHERE variant_id = ?
        `).bind(variant_id).first<{ on_hand: number }>();

        const onHand = currentStock?.on_hand ?? 0;
        if (onHand + delta < 0) {
          return jsonError(c, `Insufficient stock. Available: ${onHand}, Requested: ${Math.abs(delta)}`, 400);
        }
      }

      // Insert movement
      const result = await c.env.DB.prepare(`
        INSERT INTO inventory_movements (variant_id, delta, reason, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(variant_id, delta, reason).run();

      // Calculate new on_hand
      const onHandResult = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(delta), 0) as on_hand FROM inventory_movements WHERE variant_id = ?
      `).bind(variant_id).first<{ on_hand: number }>();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'inventory_movement', `variant:${variant_id}`, JSON.stringify({ delta, reason })).run();

      return jsonOk(c, {
        movement: {
          id: Number(result.meta.last_row_id),
          variant_id,
          delta,
          reason,
        },
        on_hand: onHandResult?.on_hand || 0,
      });
    } catch (err) {
      logger.error('Failed to record inventory movement', { error: String(err) });
      return jsonError(c, 'Failed to record inventory movement');
    }
  }
);

// PUT /admin/inventory/thresholds/:variantId - Update threshold for a variant
inventory.put(
  '/admin/inventory/thresholds/:variantId',
  zValidator('param', thresholdParamSchema, validationErrorHandler),
  zValidator('json', updateThresholdSchema, validationErrorHandler),
  async (c) => {
    const { variantId } = c.req.valid('param');
    const { threshold } = c.req.valid('json');

    try {
      // Verify variant exists
      const variant = await c.env.DB.prepare('SELECT id FROM variants WHERE id = ?').bind(variantId).first();
      if (!variant) {
        return jsonError(c, 'Variant not found', 404);
      }

      // Upsert threshold
      await c.env.DB.prepare(`
        INSERT INTO inventory_thresholds (variant_id, threshold, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(variant_id) DO UPDATE SET threshold = ?, updated_at = datetime('now')
      `).bind(variantId, threshold, threshold).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_threshold', `variant:${variantId}`, JSON.stringify({ threshold })).run();

      return jsonOk(c, { variant_id: variantId, threshold });
    } catch (err) {
      logger.error('Failed to update threshold', { error: String(err) });
      return jsonError(c, 'Failed to update threshold');
    }
  }
);

export default inventory;
