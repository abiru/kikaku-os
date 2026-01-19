import { Hono } from 'hono';
import type { Env } from '../env';
import { jsonError, jsonOk } from '../lib/http';

const adminReports = new Hono<Env>();

// GET /admin/reports - List Daily Close documents
adminReports.get('/reports', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');
  const offset = (page - 1) * perPage;

  try {
    // ref_type='daily_close', content_type='text/html' usually for the report view
    const countQuery = "SELECT COUNT(*) as count FROM documents WHERE ref_type = 'daily_close' AND content_type = 'text/html'";
    const countRes = await c.env.DB.prepare(countQuery).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const query = `
      SELECT id, ref_id as date, path, created_at
      FROM documents
      WHERE ref_type = 'daily_close' AND content_type = 'text/html'
      ORDER BY ref_id DESC
      LIMIT ? OFFSET ?
    `;
    const res = await c.env.DB.prepare(query).bind(perPage, offset).all();

    return jsonOk(c, {
      reports: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch reports');
  }
});

// GET /admin/ledger - List Ledger Entries
adminReports.get('/ledger', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '50');
  const offset = (page - 1) * perPage;

  try {
    const countQuery = "SELECT COUNT(*) as count FROM ledger_entries";
    const countRes = await c.env.DB.prepare(countQuery).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    const query = `
      SELECT e.id, e.created_at, e.ref_type, e.ref_id, e.memo,
             e.debit, e.credit, e.currency,
             a.name as account_name
      FROM ledger_entries e
      LEFT JOIN ledger_accounts a ON a.id = e.account_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ? OFFSET ?
    `;
    const res = await c.env.DB.prepare(query).bind(perPage, offset).all();

    return jsonOk(c, {
      entries: res.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  } catch (err) {
    console.error(err);
    return jsonError(c, 'Failed to fetch ledger entries');
  }
});

export default adminReports;
