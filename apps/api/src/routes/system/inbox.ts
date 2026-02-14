import { Hono } from 'hono';
import { jsonError, jsonOk } from '../../lib/http';
import { createInboxSchema } from '../../lib/schemas';
import type { Env } from '../../env';
import { getActor } from '../../middleware/clerkAuth';
import { dispatchApproval } from '../../services/inboxHandlers';

const inbox = new Hono<Env>();

inbox.get('/inbox', async (c) => {
  const status = c.req.query('status') || 'open';
  const kind = c.req.query('kind');
  const date = c.req.query('date');
  const severity = c.req.query('severity');
  const requested = Number(c.req.query('limit') || 100);
  const limit = Math.min(Math.max(requested, 1), 200);
  try {
    const where: string[] = ['status=?'];
    const params: unknown[] = [status];
    if (kind) {
      where.push('kind=?');
      params.push(kind);
    }
    if (date) {
      where.push('date=?');
      params.push(date);
    }
    if (severity) {
      where.push('severity=?');
      params.push(severity);
    }
    const sql = `SELECT id, title, body, severity, status, kind, date, created_at
      FROM inbox_items
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?`;
    const stmt = c.env.DB.prepare(sql);
    const res = await stmt.bind(...params, limit).all();
    return jsonOk(c, { items: res.results || [] });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch inbox');
  }
});

// Create new inbox item
inbox.post('/inbox', async (c) => {
  try {
    const raw = await c.req.json();
    const parsed = createInboxSchema.safeParse(raw);

    if (!parsed.success) {
      const messages = parsed.error.issues.map((e) => e.message).join(', ');
      return jsonError(c, messages, 400);
    }

    const { title, body: itemBody, severity, kind, date, metadata } = parsed.data;

    const result = await c.env.DB.prepare(`
      INSERT INTO inbox_items (title, body, severity, kind, date, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      title,
      itemBody || null,
      severity,
      kind || null,
      date || null,
      metadata || null
    ).run();

    return jsonOk(c, { id: result.meta.last_row_id });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to create inbox item');
  }
});

type InboxItem = {
  id: number;
  kind: string | null;
  metadata: string | null;
};

inbox.post('/inbox/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const item = await c.env.DB.prepare(
      `SELECT id, kind, metadata FROM inbox_items WHERE id = ?`
    ).bind(id).first<InboxItem>();

    if (!item) {
      return jsonError(c, 'Inbox item not found', 404);
    }

    const actor = getActor(c);

    if (item.kind && item.metadata) {
      await dispatchApproval(
        { db: c.env.DB, r2: c.env.R2, actor, itemId: id, metadata: item.metadata },
        item.kind,
      );
    }

    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='approved', decided_by=?, decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(actor, id).run();

    return jsonOk(c, { applied: item.kind === 'product_update' });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to approve');
  }
});

inbox.post('/inbox/:id/reject', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='rejected', decided_by=?, decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(getActor(c), id).run();
    return jsonOk(c, {});
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to reject');
  }
});

export default inbox;
