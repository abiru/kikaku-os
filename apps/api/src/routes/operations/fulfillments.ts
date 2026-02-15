import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { jsonError, jsonOk } from '../../lib/http';
import {
  updateFulfillmentSchema,
  fulfillmentIdParamSchema,
  orderFulfillmentParamSchema,
  createFulfillmentSchema,
} from '../../lib/schemas';
import type { Env } from '../../env';
import { getActor } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';
import { sendShippingNotificationEmail } from '../../services/orderEmail';

const fulfillments = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)

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
    const { status, tracking_number, carrier } = c.req.valid('json');

    try {
      // Verify fulfillment exists and get current status
      const existing = await c.env.DB.prepare(
        'SELECT id, order_id, status as old_status, metadata FROM fulfillments WHERE id = ?'
      ).bind(id).first<{ id: number; order_id: number; old_status: string; metadata: string | null }>();

      if (!existing) {
        return jsonError(c, 'Fulfillment not found', 404);
      }

      // Merge carrier into metadata
      const currentMetadata = existing.metadata ? JSON.parse(existing.metadata) : {};
      const updatedMetadata = carrier ? { ...currentMetadata, carrier } : currentMetadata;

      // Update fulfillment
      await c.env.DB.prepare(`
        UPDATE fulfillments
        SET status = ?, tracking_number = ?, metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(status, tracking_number || null, JSON.stringify(updatedMetadata), id).run();

      // Fetch updated record
      const updated = await c.env.DB.prepare(
        'SELECT id, order_id, status, tracking_number, metadata, created_at, updated_at FROM fulfillments WHERE id = ?'
      ).bind(id).first<FulfillmentRow>();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_fulfillment', `fulfillment:${id}`,
        JSON.stringify({ status, tracking_number, carrier, order_id: existing.order_id })).run();

      // Send shipping notification email when status changes to 'shipped' with tracking info
      const wasNotShipped = existing.old_status !== 'shipped';
      const isNowShipped = status === 'shipped';
      const hasTrackingNumber = tracking_number && tracking_number.trim() !== '';

      if (wasNotShipped && isNowShipped && hasTrackingNumber) {
        const carrierName = carrier || updatedMetadata.carrier || '配送業者';
        sendShippingNotificationEmail(c.env, existing.order_id, carrierName, tracking_number).catch((err) => {
          console.error('Failed to send shipping notification email:', err);
        });
      }

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
    const { status, tracking_number, carrier } = c.req.valid('json');

    try {
      // Verify order exists
      const order = await c.env.DB.prepare(
        'SELECT id FROM orders WHERE id = ?'
      ).bind(orderId).first();

      if (!order) {
        return jsonError(c, 'Order not found', 404);
      }

      // Build metadata with carrier if provided
      const metadata = carrier ? JSON.stringify({ carrier }) : null;

      // Create fulfillment
      const result = await c.env.DB.prepare(`
        INSERT INTO fulfillments (order_id, status, tracking_number, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(orderId, status || 'pending', tracking_number || null, metadata).run();

      const fulfillment = await c.env.DB.prepare(
        'SELECT id, order_id, status, tracking_number, metadata, created_at, updated_at FROM fulfillments WHERE id = ?'
      ).bind(result.meta.last_row_id).first<FulfillmentRow>();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_fulfillment', `order:${orderId}`,
        JSON.stringify({ status, tracking_number, carrier, fulfillment_id: result.meta.last_row_id })).run();

      // Send shipping notification email when creating a fulfillment with status 'shipped' and tracking info
      const isShipped = status === 'shipped';
      const hasTrackingNumber = tracking_number && tracking_number.trim() !== '';

      if (isShipped && hasTrackingNumber) {
        const carrierName = carrier || '配送業者';
        sendShippingNotificationEmail(c.env, orderId, carrierName, tracking_number).catch((err) => {
          console.error('Failed to send shipping notification email:', err);
        });
      }

      return jsonOk(c, { fulfillment });
    } catch (err) {
      console.error(err);
      return jsonError(c, 'Failed to create fulfillment');
    }
  }
);

export default fulfillments;
