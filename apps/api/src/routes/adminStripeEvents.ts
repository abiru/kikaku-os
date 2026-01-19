import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError, jsonOk } from "../lib/http";
import { handleStripeEvent } from "./stripe";

const adminStripeEvents = new Hono<Env>();

adminStripeEvents.get("/stripe-events", async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '50');
  const status = c.req.query('status'); // pending, completed, failed
  const type = c.req.query('type'); // checkout.session.completed, etc.
  const offset = (page - 1) * perPage;

  try {
    let where = "WHERE 1=1";
    const params: any[] = [];

    if (status) {
      where += " AND processing_status = ?";
      params.push(status);
    }

    if (type) {
      where += " AND event_type = ?";
      params.push(type);
    }

    const countQuery = `SELECT COUNT(*) as count FROM stripe_events ${where}`;
    const countRes = await c.env.DB.prepare(countQuery).bind(...params).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const sql = `
      SELECT id, event_id, event_type, event_created, processing_status, error, received_at, processed_at
      FROM stripe_events
      ${where}
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `;

    const res = await c.env.DB.prepare(sql).bind(...params, perPage, offset).all();

    return jsonOk(c, {
      events: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to fetch stripe events");
  }
});

adminStripeEvents.get("/stripe-events/:id", async (c) => {
  const id = parseInt(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError(c, "Invalid event ID", 400);
  }

  try {
    const event = await c.env.DB.prepare(`
      SELECT id, event_id, event_type, event_created, payload_json, processing_status, error, received_at, processed_at
      FROM stripe_events
      WHERE id = ?
    `).bind(id).first();

    if (!event) {
      return jsonError(c, "Event not found", 404);
    }

    return jsonOk(c, { event });
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to fetch event details");
  }
});

adminStripeEvents.post("/stripe-events/:id/retry", async (c) => {
  const id = parseInt(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return jsonError(c, "Invalid event ID", 400);
  }

  try {
    const event = await c.env.DB.prepare(`
      SELECT id, event_id, event_type, payload_json, processing_status
      FROM stripe_events
      WHERE id = ?
    `).bind(id).first<{
      id: number;
      event_id: string;
      event_type: string;
      payload_json: string;
      processing_status: string;
    }>();

    if (!event) {
      return jsonError(c, "Event not found", 404);
    }

    if (event.processing_status !== 'failed') {
      return jsonError(c, `Cannot retry event with status '${event.processing_status}'`, 400);
    }

    let parsedEvent: any;
    try {
      parsedEvent = JSON.parse(event.payload_json);
    } catch {
      return jsonError(c, "Failed to parse event payload", 500);
    }

    await c.env.DB.prepare(
      `UPDATE stripe_events SET processing_status='pending', error=NULL, processed_at=NULL WHERE id=?`
    ).bind(id).run();

    try {
      const result = await handleStripeEvent(c.env, parsedEvent);
      await c.env.DB.prepare(
        `UPDATE stripe_events SET processing_status='completed', processed_at=datetime('now') WHERE id=?`
      ).bind(id).run();
      return jsonOk(c, { retried: true, event_id: event.event_id, result });
    } catch (err: any) {
      await c.env.DB.prepare(
        `UPDATE stripe_events SET processing_status='failed', error=?, processed_at=datetime('now') WHERE id=?`
      ).bind(err?.message || String(err), id).run();
      return jsonError(c, `Retry failed: ${err?.message}`, 500);
    }
  } catch (err) {
    console.error(err);
    return jsonError(c, "Failed to retry event");
  }
});

export default adminStripeEvents;
