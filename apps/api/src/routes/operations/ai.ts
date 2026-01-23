import { Hono } from 'hono';
import { jsonError, jsonOk } from '../../lib/http';
import type { Env } from '../../env';

const ai = new Hono<Env>();

const normalizeSql = (input: string) => {
  const sql = input.trim().replace(/\s+/g, ' ');
  if (!/^select\s/i.test(sql)) return { ok: false, message: 'Only SELECT is allowed' } as const;
  if (sql.includes(';')) return { ok: false, message: 'Semicolons are not allowed' } as const;
  const hasLimit = /\blimit\b/i.test(sql);
  const finalSql = hasLimit ? sql : `${sql} LIMIT 200`;
  return { ok: true, sql: finalSql } as const;
};

const extractLimit = (sql: string) => {
  const matches = [...sql.matchAll(/\blimit\s+(\d+)/gi)];
  if (matches.length === 0) return 200;
  const last = matches[matches.length - 1];
  const value = Number(last[1]);
  return Number.isFinite(value) ? value : 200;
};

ai.post('/sql', async (c) => {
  try {
    const body = await c.req.json<{ prompt?: string }>();
    const prompt = (body.prompt || '').trim();
    const draft = prompt
      ? `SELECT * FROM orders WHERE status='paid'`
      : 'SELECT * FROM orders';
    const normalized = normalizeSql(draft);
    if (!normalized.ok) return jsonError(c, normalized.message, 400);
    return jsonOk(c, { sql: normalized.sql, notes: 'Dummy SQL generated. Please review before executing.' });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to generate SQL');
  }
});

ai.post('/query', async (c) => {
  try {
    const body = await c.req.json<{ sql?: string; prompt?: string }>();
    const rawSql = (body.sql || '').trim();
    const normalized = normalizeSql(rawSql);
    if (!normalized.ok) return jsonError(c, normalized.message, 400);

    await c.env.DB.prepare(
      `INSERT INTO events (type, payload, created_at) VALUES ('ai_query', ?, datetime('now'))`
    ).bind(JSON.stringify({ prompt: body.prompt || null, sql: normalized.sql })).run();

    const limit = extractLimit(normalized.sql);
    const res = await c.env.DB.prepare(normalized.sql).all<Record<string, unknown>>();
    const rows = res.results || [];
    return jsonOk(c, { rows, truncated: rows.length >= limit });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to execute SQL');
  }
});

export default ai;
