import { Hono } from 'hono';
import { jsonError, jsonOk } from '../lib/http';
import type { Env } from '../env';

const inventory = new Hono<Env>();

inventory.get('/inventory/low', async (c) => {
  const requested = Number(c.req.query('limit') || 100);
  const limit = Math.min(Math.max(requested, 1), 200);
  try {
    const res = await c.env.DB.prepare(
      `SELECT t.variant_id as variant_id,
              COALESCE(SUM(m.delta), 0) as on_hand,
              t.threshold as threshold
       FROM inventory_thresholds t
       LEFT JOIN inventory_movements m ON m.variant_id = t.variant_id
       GROUP BY t.variant_id
       HAVING on_hand < t.threshold
       ORDER BY (t.threshold - on_hand) DESC
       LIMIT ?`
    ).bind(limit).all<{ variant_id: number; on_hand: number; threshold: number }>();
    return jsonOk(c, { items: res.results || [] });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch low inventory');
  }
});

inventory.post('/inventory/thresholds', async (c) => {
  try {
    const body = await c.req.json<{ variant_id?: number; threshold?: number }>();
    const variantId = Number(body.variant_id);
    const threshold = Number(body.threshold);
    if (!Number.isFinite(variantId) || !Number.isFinite(threshold)) {
      return jsonError(c, 'Invalid payload', 400);
    }
    await c.env.DB.prepare(
      `INSERT INTO inventory_thresholds (variant_id, threshold, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(variant_id) DO UPDATE SET threshold=excluded.threshold, updated_at=datetime('now')`
    ).bind(variantId, threshold).run();
    return jsonOk(c, { variant_id: variantId, threshold });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to upsert threshold');
  }
});

export default inventory;
