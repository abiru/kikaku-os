import { Hono } from 'hono';
import { jsonError, jsonOk } from '../lib/http';
import type { Env } from '../env';

const inbox = new Hono<Env>();

inbox.get('/inbox', async (c) => {
  const status = c.req.query('status') || 'open';
  const severity = c.req.query('severity');
  const requested = Number(c.req.query('limit') || 100);
  const limit = Math.min(Math.max(requested, 1), 200);
  try {
    const base = `SELECT id, title, body, severity, status, created_at FROM inbox_items WHERE status=?`;
    const sql = severity ? `${base} AND severity=? ORDER BY created_at DESC LIMIT ?` : `${base} ORDER BY created_at DESC LIMIT ?`;
    const stmt = c.env.DB.prepare(sql);
    const res = severity ? await stmt.bind(status, severity, limit).all() : await stmt.bind(status, limit).all();
    return jsonOk(c, { items: res.results || [] });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch inbox');
  }
});

inbox.post('/inbox/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='approved', decided_by='admin', decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(id).run();
    return jsonOk(c, {});
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to approve');
  }
});

inbox.post('/inbox/:id/reject', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await c.env.DB.prepare(
      `UPDATE inbox_items SET status='rejected', decided_by='admin', decided_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(id).run();
    return jsonOk(c, {});
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to reject');
  }
});

export default inbox;
