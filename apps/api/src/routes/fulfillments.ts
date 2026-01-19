import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { jsonError, jsonOk } from '../lib/http';
import {
  updateFulfillmentSchema,
  fulfillmentIdParamSchema,
  orderFulfillmentParamSchema,
  createFulfillmentSchema,
} from '../lib/schemas';
import type { Env } from '../env';

const fulfillments = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

type FulfillmentRow = {
  id: number;
  order_id: number;
  status: string;
  tracking_number: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

// PUT /admin/fulfillments/:id - Update fulfillment status
fulfillments.put(
  '/admin/fulfillments/:id',
  zValidator('param', fulfillmentIdParamSchema, validationErrorHandler),
  zValidator('json', updateFulfillmentSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { status, tracking_number } = c.req.valid('json');

    try {
      // Verify fulfillment exists
      const existing = await c.env.DB.prepare(
        'SELECT id, order_id FROM fulfillments WHERE id = ?'
      ).bind(id).first<{ id: number; order_id: number }>();

      if (!existing) {
        return jsonError(c, 'Fulfillment not found', 404);
      }

      // Update fulfillment
      await c.env.DB.prepare(`
        UPDATE fulfillments
        SET status = ?, tracking_number = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(status, tracking_number || null, id).run();

      // Fetch updated record
      const updated = await c.env.DB.prepare(
        'SELECT * FROM fulfillments WHERE id = ?'
      ).bind(id).first<FulfillmentRow>();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'update_fulfillment', `fulfillment:${id}`,
        JSON.stringify({ status, tracking_number, order_id: existing.order_id })).run();

      return jsonOk(c, { fulfillment: updated });
    } catch (err) {
      console.error(err);
      return jsonError(c, 'Failed to update fulfillment');
    }
  }
);

// POST /admin/orders/:orderId/fulfillments - Create fulfillment for order
fulfillments.post(
  '/admin/orders/:orderId/fulfillments',
  zValidator('param', orderFulfillmentParamSchema, validationErrorHandler),
  zValidator('json', createFulfillmentSchema, validationErrorHandler),
  async (c) => {
    const { orderId } = c.req.valid('param');
    const { status, tracking_number } = c.req.valid('json');

    try {
      // Verify order exists
      const order = await c.env.DB.prepare(
        'SELECT id FROM orders WHERE id = ?'
      ).bind(orderId).first();

      if (!order) {
        return jsonError(c, 'Order not found', 404);
      }

      // Create fulfillment
      const result = await c.env.DB.prepare(`
        INSERT INTO fulfillments (order_id, status, tracking_number, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(orderId, status || 'pending', tracking_number || null).run();

      const fulfillment = await c.env.DB.prepare(
        'SELECT * FROM fulfillments WHERE id = ?'
      ).bind(result.meta.last_row_id).first<FulfillmentRow>();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'create_fulfillment', `order:${orderId}`,
        JSON.stringify({ status, tracking_number, fulfillment_id: result.meta.last_row_id })).run();

      return jsonOk(c, { fulfillment });
    } catch (err) {
      console.error(err);
      return jsonError(c, 'Failed to create fulfillment');
    }
  }
);

export default fulfillments;
