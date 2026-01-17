import { Hono } from 'hono';
import { jsonError, jsonOk } from '../lib/http';
import type { Env } from '../env';

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
