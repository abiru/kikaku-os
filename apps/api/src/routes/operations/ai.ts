import { Hono } from 'hono';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import type { Env } from '../../env';

const logger = createLogger('operations-ai');
const ai = new Hono<Env>();

// Whitelist of tables allowed in AI-generated queries
const ALLOWED_TABLES = new Set([
  'products', 'variants', 'prices', 'orders', 'order_items',
  'customers', 'payments', 'refunds', 'inventory_movements',
  'events', 'coupons', 'coupon_usages', 'categories',
  'product_categories', 'product_images', 'product_reviews',
  'ledger_entries', 'ledger_accounts', 'fulfillments',
  'tax_rates', 'documents'
]);

// Dangerous SQL keywords that should never appear in AI queries
const DANGEROUS_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b/i,
  /\b(ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i,
  /\b(INTO)\s/i,
  /\b(GRANT|REVOKE)\b/i,
  /--/,             // SQL comments
  /\/\*/,           // Block comments
];

const MAX_LIMIT = 200;

/**
 * Extract table names from a SQL query (simplified parser)
 * Looks for identifiers after FROM, JOIN keywords
 */
export const extractTableNames = (sql: string): string[] => {
  const withoutStrings = sql.replace(/'[^']*'/g, '');
  const fromMatch = withoutStrings.match(/\bFROM\b([\s\S]+)/i);
  if (!fromMatch) return [];

  const fromRaw = fromMatch[1] ?? '';
  const fromClause = (fromRaw
    .split(/\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bHAVING\b|\bUNION\b|\bEXCEPT\b|\bINTERSECT\b/i)[0] ?? '')
    .replace(/\b(?:INNER|LEFT(?:\s+OUTER)?|RIGHT(?:\s+OUTER)?|CROSS)\s+JOIN\b/gi, ',')
    .replace(/\bJOIN\b/gi, ',');

  const tables = new Set<string>();
  const tableTokenPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\b/;
  for (const token of fromClause.split(',')) {
    const tableMatch = token.match(tableTokenPattern);
    if (tableMatch && tableMatch[1]) {
      tables.add(tableMatch[1].toLowerCase());
    }
  }
  return [...tables];
};

/**
 * Check if SQL contains subqueries
 */
export const hasSubquery = (sql: string): boolean => {
  // Remove the outermost SELECT and check for nested SELECT
  const withoutStrings = sql.replace(/'[^']*'/g, '');
  const selectCount = (withoutStrings.match(/\bSELECT\b/gi) || []).length;
  return selectCount > 1;
};

/**
 * Validate and normalize AI-generated SQL
 */
export const validateSql = (input: string): { ok: true; sql: string } | { ok: false; message: string } => {
  const sql = input.trim().replace(/\s+/g, ' ');

  // Must be a SELECT statement
  if (!/^SELECT\s/i.test(sql)) {
    return { ok: false, message: 'Only SELECT statements are allowed' };
  }

  // No semicolons
  if (sql.includes(';')) {
    return { ok: false, message: 'Semicolons are not allowed' };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      return { ok: false, message: 'Query contains prohibited SQL keywords' };
    }
  }

  // Check for UNION (data exfiltration risk)
  if (/\bUNION\b/i.test(sql)) {
    return { ok: false, message: 'UNION queries are not allowed' };
  }

  // Check for subqueries
  if (hasSubquery(sql)) {
    return { ok: false, message: 'Subqueries are not allowed' };
  }

  // Validate table names against whitelist
  const tables = extractTableNames(sql);
  if (tables.length === 0) {
    return { ok: false, message: 'No valid table reference found' };
  }

  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) {
      return { ok: false, message: `Access to table '${table}' is not allowed` };
    }
  }

  // Enforce LIMIT
  const hasLimit = /\bLIMIT\b/i.test(sql);
  let finalSql = sql;
  if (hasLimit) {
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?\s*$/i);
    if (!limitMatch) {
      return { ok: false, message: 'LIMIT clause must use non-negative integer values' };
    }
    const limitVal = parseInt(limitMatch[1] ?? '0', 10);
    const offsetVal = limitMatch[2];
    const cappedLimit = Math.min(limitVal, MAX_LIMIT);
    finalSql = sql.replace(
      /\bLIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*$/i,
      `LIMIT ${cappedLimit}${offsetVal ? ` OFFSET ${offsetVal}` : ''}`
    );
  } else {
    finalSql = `${sql} LIMIT ${MAX_LIMIT}`;
  }

  return { ok: true, sql: finalSql };
};

const extractLimit = (sql: string): number => {
  const matches = [...sql.matchAll(/\bLIMIT\s+(\d+)/gi)];
  if (matches.length === 0) return MAX_LIMIT;
  const last = matches[matches.length - 1];
  if (!last) return MAX_LIMIT;
  const value = Number(last[1] ?? '0');
  return Number.isFinite(value) ? Math.min(value, MAX_LIMIT) : MAX_LIMIT;
};

/**
 * Log AI query execution to audit_logs
 */
const logAiQuery = async (
  db: D1Database,
  params: { prompt?: string; sql: string; rowCount: number; blocked?: boolean; reason?: string }
) => {
  try {
    await db.prepare(
      `INSERT INTO audit_logs (actor, action, target, metadata, created_at)
       VALUES ('ai', 'ai_query', 'database', ?, datetime('now'))`
    ).bind(JSON.stringify(params)).run();
  } catch {
    // Non-critical: silently fail audit logging
  }
};

ai.post('/sql', async (c) => {
  try {
    const body = await c.req.json<{ prompt?: string }>();
    const prompt = (body.prompt || '').trim();
    const draft = prompt
      ? `SELECT id, customer_id, status, total_amount, currency, created_at, paid_at FROM orders WHERE status='paid'`
      : 'SELECT id, customer_id, status, total_amount, currency, created_at, paid_at FROM orders';
    const validated = validateSql(draft);
    if (!validated.ok) return jsonError(c, validated.message, 400);
    return jsonOk(c, { sql: validated.sql, notes: 'Dummy SQL generated. Please review before executing.' });
  } catch (err) {
    logger.error('Failed to generate SQL', { error: String(err) });
    return jsonError(c, 'Failed to generate SQL');
  }
});

ai.post('/query', async (c) => {
  try {
    const body = await c.req.json<{ sql?: string; prompt?: string }>();
    const rawSql = (body.sql || '').trim();

    if (!rawSql) {
      return jsonError(c, 'SQL query is required', 400);
    }

    const validated = validateSql(rawSql);
    if (!validated.ok) {
      await logAiQuery(c.env.DB, {
        prompt: body.prompt || undefined,
        sql: rawSql,
        rowCount: 0,
        blocked: true,
        reason: validated.message
      });
      return jsonError(c, validated.message, 400);
    }

    // Log to events table (existing behavior)
    await c.env.DB.prepare(
      `INSERT INTO events (type, payload, created_at) VALUES ('ai_query', ?, datetime('now'))`
    ).bind(JSON.stringify({ prompt: body.prompt || null, sql: validated.sql })).run();

    const limit = extractLimit(validated.sql);
    const res = await c.env.DB.prepare(validated.sql).all<Record<string, unknown>>();
    const rows = res.results || [];

    // Audit log
    await logAiQuery(c.env.DB, {
      prompt: body.prompt || undefined,
      sql: validated.sql,
      rowCount: rows.length
    });

    return jsonOk(c, { rows, truncated: rows.length >= limit });
  } catch (err) {
    logger.error('Failed to execute SQL', { error: String(err) });
    return jsonError(c, 'Failed to execute SQL');
  }
});

export default ai;
