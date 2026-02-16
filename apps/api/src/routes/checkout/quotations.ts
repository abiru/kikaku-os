import { Hono } from 'hono';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { createLogger } from '../../lib/logger';
import { getCompanyInfo } from '../../lib/company';
import { PERMISSIONS } from '../../lib/schemas';
import { renderQuotationHtml, QuotationData } from '../../services/renderQuotationHtml';
import { putText } from '../../lib/r2';
import { upsertDocument } from '../../services/documents';
import { validateItem, type CheckoutItem } from '../../lib/schemas/checkout';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import {
  createQuotation,
  acceptQuotation,
  QuotationError,
  type CreateQuotationInput,
} from '../../services/quotation';

const logger = createLogger('quotations');
const quotations = new Hono<Env>();

const normalizeString = (value: unknown) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

// POST /quotations - Create new quotation
quotations.post('/quotations', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }
  const bodyObj = body as Record<string, unknown> | null;

  const customerCompany = normalizeString(bodyObj?.customerCompany);
  const customerName = normalizeString(bodyObj?.customerName);
  const customerEmail = normalizeString(bodyObj?.customerEmail);
  const customerPhone = normalizeString(bodyObj?.customerPhone);
  const notes = normalizeString(bodyObj?.notes);

  if (!customerCompany) return jsonError(c, 'customerCompany is required', 400);
  if (!customerName) return jsonError(c, 'customerName is required', 400);

  const items: CheckoutItem[] = [];
  if (Array.isArray(bodyObj?.items)) {
    for (const rawItem of (bodyObj.items as unknown[])) {
      const item = validateItem(rawItem);
      if (!item) return jsonError(c, 'Invalid item in items array', 400);
      items.push(item);
    }
  }

  if (items.length === 0) return jsonError(c, 'No items provided', 400);
  if (items.length > 20) return jsonError(c, 'Too many items (max 20)', 400);

  try {
    const input: CreateQuotationInput = { customerCompany, customerName, customerEmail, customerPhone, notes, items };
    const result = await createQuotation(c.env.DB, input);
    return jsonOk(c, result);
  } catch (err) {
    if (err instanceof QuotationError) {
      return jsonError(c, err.message, err.status);
    }
    throw err;
  }
});

// GET /quotations/:token - Get quotation details by public token
quotations.get('/quotations/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) return jsonError(c, 'Invalid quotation identifier', 400);

  const quotation = await c.env.DB.prepare(
    `SELECT id, quotation_number, customer_company, customer_name, customer_email, customer_phone, subtotal, tax_amount, total_amount, currency, valid_until, status, converted_order_id, notes, metadata, public_token, created_at, updated_at FROM quotations WHERE public_token = ?`
  ).bind(token).first();

  if (!quotation) return jsonError(c, 'Quotation not found', 404);

  const items = await c.env.DB.prepare(
    `SELECT id, quotation_id, variant_id, product_title, variant_title, quantity, unit_price, subtotal, metadata, created_at, updated_at FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(quotation.id).all();

  return jsonOk(c, { quotation, items: items.results || [] });
});

// GET /quotations/:token/html - Generate HTML for quotation
quotations.get('/quotations/:token/html', async (c) => {
  const token = c.req.param('token');
  if (!token) return jsonError(c, 'Invalid quotation identifier', 400);

  const quotation = await c.env.DB.prepare(
    `SELECT id, quotation_number, customer_company, customer_name, customer_email, customer_phone, subtotal, tax_amount, total_amount, currency, valid_until, notes, public_token, created_at FROM quotations WHERE public_token = ?`
  ).bind(token).first();

  if (!quotation) return jsonError(c, 'Quotation not found', 404);

  const id = quotation.id as number;

  const items = await c.env.DB.prepare(
    `SELECT product_title, variant_title, quantity, unit_price, subtotal
     FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(id).all<{
    product_title: string;
    variant_title: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>();

  const data: QuotationData = {
    quotation: {
      id: quotation.id as number,
      quotation_number: quotation.quotation_number as string,
      customer_company: quotation.customer_company as string,
      customer_name: quotation.customer_name as string,
      customer_email: quotation.customer_email as string | null,
      customer_phone: quotation.customer_phone as string | null,
      subtotal: quotation.subtotal as number,
      tax_amount: quotation.tax_amount as number,
      total_amount: quotation.total_amount as number,
      currency: quotation.currency as string,
      valid_until: quotation.valid_until as string,
      notes: quotation.notes as string | null,
      created_at: quotation.created_at as string,
    },
    items: (items.results || []).map((item) => ({
      product_title: item.product_title as string,
      variant_title: (item.variant_title as string | null),
      quantity: item.quantity as number,
      unit_price: item.unit_price as number,
      subtotal: item.subtotal as number,
    })),
  };

  const company = await getCompanyInfo(c.env);
  const html = renderQuotationHtml(data, company);

  const path = `quotations/${id}/quotation.html`;
  try {
    await putText(c.env.R2, path, html, 'text/html');
    await upsertDocument(c.env, 'quotation', quotation.quotation_number as string, path, 'text/html');
  } catch (error) {
    logger.error('Failed to save HTML to R2', { error: String(error) });
  }

  return c.html(html);
});

// POST /quotations/:token/accept - Accept quotation and create order
quotations.post('/quotations/:token/accept', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);

  const token = c.req.param('token');
  if (!token) return jsonError(c, 'Invalid quotation identifier', 400);

  let acceptBody: Record<string, unknown> = {};
  try {
    acceptBody = (await c.req.json()) as Record<string, unknown>;
  } catch {
    acceptBody = {};
  }

  const email = normalizeString(acceptBody?.email);
  const baseUrl = c.env.STOREFRONT_BASE_URL;
  if (!baseUrl) {
    return jsonError(c, 'STOREFRONT_BASE_URL is not configured', 500);
  }

  try {
    const result = await acceptQuotation(c.env.DB, stripeKey, baseUrl, token, email);
    return jsonOk(c, result);
  } catch (err) {
    if (err instanceof QuotationError) {
      return jsonError(c, err.message, err.status);
    }
    logger.error('Failed to accept quotation', { error: String(err) });
    throw err;
  }
});

// DELETE /quotations/:id - Delete quotation (admin only, guarded)
quotations.delete('/quotations/:id', loadRbac, requirePermission(PERMISSIONS.ORDERS_WRITE), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return jsonError(c, 'Invalid quotation ID', 400);

  const quotation = await c.env.DB.prepare(
    `SELECT id, status, converted_order_id FROM quotations WHERE id = ?`
  ).bind(id).first<{ id: number; status: string; converted_order_id: number | null }>();

  if (!quotation) return jsonError(c, 'Quotation not found', 404);

  if (quotation.converted_order_id) {
    const order = await c.env.DB.prepare(
      `SELECT id, status FROM orders WHERE id = ?`
    ).bind(quotation.converted_order_id).first<{ id: number; status: string }>();

    if (order && order.status !== 'cancelled') {
      return jsonError(
        c,
        `Cannot delete quotation with active order #${order.id} (status: ${order.status})`,
        409
      );
    }
  }

  if (quotation.status === 'accepted') {
    return jsonError(c, 'Cannot delete an accepted quotation', 409);
  }

  await c.env.DB.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM quotations WHERE id = ?`).bind(id).run();

  return jsonOk(c, { deleted: true, id });
});

// GET /quotations - List quotations (for admin)
quotations.get('/quotations', loadRbac, requirePermission(PERMISSIONS.ORDERS_READ), async (c) => {
  const status = c.req.query('status');
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');

  if (page < 1 || perPage < 1 || perPage > 100) {
    return jsonError(c, 'Invalid pagination parameters', 400);
  }

  const offset = (page - 1) * perPage;

  let query = `SELECT id, quotation_number, customer_company, customer_name, customer_email, customer_phone, subtotal, tax_amount, total_amount, currency, valid_until, status, converted_order_id, notes, metadata, public_token, created_at, updated_at FROM quotations`;
  const params: (string | number)[] = [];

  if (status) {
    query += ` WHERE status = ?`;
    params.push(status);
  }

  query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(perPage, offset);

  const quotationsResult = await c.env.DB.prepare(query).bind(...params).all();

  let countQuery = `SELECT COUNT(*) as count FROM quotations`;
  if (status) {
    countQuery += ` WHERE status = ?`;
  }
  const countResult = await c.env.DB.prepare(countQuery)
    .bind(...(status ? [status] : []))
    .first<{ count: number }>();

  const totalCount = countResult?.count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  return jsonOk(c, {
    quotations: quotationsResult.results || [],
    meta: { page, perPage, totalCount, totalPages }
  });
});

export default quotations;
