import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../env';
import { jsonError, jsonOk } from '../../lib/http';
import { calculateOrderTax, type TaxCalculationInput } from '../../services/tax';
import { getCompanyInfo } from '../../lib/company';
import { renderQuotationHtml, QuotationData } from '../../services/renderQuotationHtml';
import { putText } from '../../lib/r2';
import { upsertDocument } from '../../services/documents';
import { ensureStripePriceForVariant } from '../../services/stripe';
import { generatePublicToken } from '../../lib/token';
import { timingSafeCompare } from '../../middleware/clerkAuth';

const quotations = new Hono<Env>();

type CheckoutItem = {
  variantId: number;
  quantity: number;
};

type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  provider_product_id: string | null;
  tax_rate: number | null;
};

const validateItem = (item: unknown): CheckoutItem | null => {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const variantId = Number(obj.variantId);
  const quantity = Number(obj.quantity ?? 1);
  if (!Number.isInteger(variantId) || variantId <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  return { variantId, quantity };
};

const normalizeString = (value: unknown) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

// POST /quotations - Create new quotation
quotations.post('/quotations', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'Invalid JSON', 400);
  }

  const customerCompany = normalizeString(body?.customerCompany);
  const customerName = normalizeString(body?.customerName);
  const customerEmail = normalizeString(body?.customerEmail);
  const customerPhone = normalizeString(body?.customerPhone);
  const notes = normalizeString(body?.notes);

  if (!customerCompany) {
    return jsonError(c, 'customerCompany is required', 400);
  }
  if (!customerName) {
    return jsonError(c, 'customerName is required', 400);
  }

  // Validate items
  let items: CheckoutItem[] = [];
  if (Array.isArray(body?.items)) {
    for (const rawItem of body.items) {
      const item = validateItem(rawItem);
      if (!item) {
        return jsonError(c, 'Invalid item in items array', 400);
      }
      items.push(item);
    }
  }

  if (items.length === 0) {
    return jsonError(c, 'No items provided', 400);
  }
  if (items.length > 20) {
    return jsonError(c, 'Too many items (max 20)', 400);
  }

  // Fetch variant/price data
  const variantIds = items.map((i) => i.variantId);
  const placeholders = variantIds.map(() => '?').join(',');
  const variantRows = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency,
            tr.rate as tax_rate
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE v.id IN (${placeholders})
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<VariantPriceRow>();

  // Build map of variant_id -> price row
  const variantMap = new Map<number, VariantPriceRow>();
  for (const row of variantRows.results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }

  // Validate all variants exist
  for (const item of items) {
    const row = variantMap.get(item.variantId);
    if (!row) {
      return jsonError(c, `Variant ${item.variantId} not found`, 404);
    }
  }

  // Calculate totals with proper tax rate lookup
  const taxInputs: TaxCalculationInput[] = items.map((item) => {
    const row = variantMap.get(item.variantId)!;
    return {
      unitPrice: row.amount,
      quantity: item.quantity,
      taxRate: row.tax_rate ?? 0.10
    };
  });

  const taxCalculation = calculateOrderTax(taxInputs);
  const subtotal = taxCalculation.subtotal;
  const taxAmount = taxCalculation.taxAmount;
  const totalAmount = taxCalculation.totalAmount;

  let currency = 'JPY';
  if (items.length > 0) {
    const row = variantMap.get(items[0].variantId)!;
    currency = (row.currency || 'JPY').toUpperCase();
  }

  // Calculate valid_until (30 days from now)
  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntil = validUntilDate.toISOString().split('T')[0];

  // Create quotation record (with placeholder number)
  const publicToken = generatePublicToken();
  const quotationRes = await c.env.DB.prepare(
    `INSERT INTO quotations (
      quotation_number, customer_company, customer_name, customer_email, customer_phone,
      subtotal, tax_amount, total_amount, currency, valid_until, status, notes,
      public_token, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    'TEMP',
    customerCompany,
    customerName,
    customerEmail,
    customerPhone,
    subtotal,
    taxAmount,
    totalAmount,
    currency,
    validUntil,
    notes,
    publicToken
  ).run();

  const quotationId = Number(quotationRes.meta.last_row_id);

  // Generate quotation number (EST-0001 format)
  const quotationNumber = `EST-${String(quotationId).padStart(4, '0')}`;

  // Update quotation number
  await c.env.DB.prepare(
    `UPDATE quotations SET quotation_number = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(quotationNumber, quotationId).run();

  // Insert quotation items
  for (const item of items) {
    const row = variantMap.get(item.variantId)!;
    const itemSubtotal = row.amount * item.quantity;
    await c.env.DB.prepare(
      `INSERT INTO quotation_items (
        quotation_id, variant_id, product_title, variant_title, quantity, unit_price, subtotal,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      quotationId,
      item.variantId,
      row.product_title,
      row.variant_title,
      item.quantity,
      row.amount,
      itemSubtotal
    ).run();
  }

  return jsonOk(c, {
    id: quotationId,
    publicToken,
    quotationNumber,
    subtotal,
    taxAmount,
    totalAmount,
    currency,
    validUntil
  });
});

// GET /quotations/:token - Get quotation details by public token or ID
quotations.get('/quotations/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return jsonError(c, 'Invalid quotation identifier', 400);
  }

  // Public endpoint: ONLY allow public_token lookup (no numeric ID to prevent IDOR)
  const quotation = await c.env.DB.prepare(
    `SELECT * FROM quotations WHERE public_token = ?`
  ).bind(token).first();

  if (!quotation) {
    return jsonError(c, 'Quotation not found', 404);
  }

  const items = await c.env.DB.prepare(
    `SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(quotation.id).all();

  return jsonOk(c, {
    quotation,
    items: items.results || []
  });
});

// GET /quotations/:token/html - Generate HTML for quotation
quotations.get('/quotations/:token/html', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return jsonError(c, 'Invalid quotation identifier', 400);
  }

  // Public endpoint: ONLY allow public_token lookup (no numeric ID to prevent IDOR)
  const quotation = await c.env.DB.prepare(
    `SELECT * FROM quotations WHERE public_token = ?`
  ).bind(token).first();

  if (!quotation) {
    return jsonError(c, 'Quotation not found', 404);
  }

  const id = quotation.id as number;

  const items = await c.env.DB.prepare(
    `SELECT product_title, variant_title, quantity, unit_price, subtotal
     FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(id).all();

  const data: QuotationData = {
    quotation: quotation as any,
    items: items.results as any
  };

  const company = await getCompanyInfo(c.env);
  const html = renderQuotationHtml(data, company);

  // Save to R2
  const path = `quotations/${id}/quotation.html`;
  try {
    await putText(c.env.R2, path, html, 'text/html');
    await upsertDocument(
      c.env,
      'quotation',
      quotation.quotation_number as string,
      path,
      'text/html'
    );
  } catch (error) {
    console.error('Failed to save HTML to R2:', error);
  }

  return c.html(html);
});

// POST /quotations/:token/accept - Accept quotation and create order
quotations.post('/quotations/:token/accept', async (c) => {
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);

  const token = c.req.param('token');
  if (!token) {
    return jsonError(c, 'Invalid quotation identifier', 400);
  }

  // Public endpoint: ONLY allow public_token lookup (no numeric ID to prevent IDOR)
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const email = normalizeString(body?.email);

  const quotation = await c.env.DB.prepare(
    `SELECT * FROM quotations WHERE public_token = ?`
  ).bind(token).first<any>();

  if (!quotation) {
    return jsonError(c, 'Quotation not found', 404);
  }

  const id = quotation.id as number;

  // Validate status
  if (quotation.status !== 'draft' && quotation.status !== 'sent') {
    return jsonError(c, `Cannot accept quotation with status: ${quotation.status}`, 400);
  }

  // Validate expiry
  const validUntil = new Date(quotation.valid_until);
  const now = new Date();
  if (now > validUntil) {
    return jsonError(c, 'Quotation has expired', 400);
  }

  // Get quotation items
  const quotationItems = await c.env.DB.prepare(
    `SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(id).all<any>();

  if (!quotationItems.results || quotationItems.results.length === 0) {
    return jsonError(c, 'No items in quotation', 400);
  }

  // Fetch variant/price data to get provider_price_id
  const variantIds = quotationItems.results.map((item: any) => item.variant_id);
  const placeholders = variantIds.map(() => '?').join(',');
  const variantRows = await c.env.DB.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            p.provider_product_id as provider_product_id,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency,
            pr.provider_price_id as provider_price_id
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     WHERE v.id IN (${placeholders})
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<VariantPriceRow>();

  const variantMap = new Map<number, VariantPriceRow>();
  for (const row of variantRows.results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }

  // Ensure Stripe prices exist
  for (const item of quotationItems.results) {
    const row = variantMap.get(item.variant_id);
    if (!row) {
      return jsonError(c, `Variant ${item.variant_id} not found`, 404);
    }
    if (!row.provider_price_id?.trim()) {
      try {
        const stripePriceId = await ensureStripePriceForVariant(c.env.DB, stripeKey, row);
        variantMap.set(item.variant_id, { ...row, provider_price_id: stripePriceId });
      } catch (err) {
        console.error(`Failed to create Stripe price for variant ${item.variant_id}:`, err);
        return jsonError(c, `Failed to create Stripe price for variant ${item.variant_id}`, 500);
      }
    }
  }

  // Customer handling
  let customerId: number | null = null;
  const customerEmail = email || quotation.customer_email;

  if (customerEmail) {
    const existingCustomer = await c.env.DB.prepare(
      `SELECT id FROM customers WHERE email=?`
    ).bind(customerEmail).first<{ id: number }>();

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
    } else {
      const res = await c.env.DB.prepare(
        `INSERT INTO customers (name, email, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      ).bind(quotation.customer_company, customerEmail).run();
      customerId = Number(res.meta.last_row_id);
    }
  }

  // Create order
  const orderPublicToken = generatePublicToken();
  const orderRes = await c.env.DB.prepare(
    `INSERT INTO orders (customer_id, status, total_net, total_fee, currency, metadata, public_token, created_at, updated_at)
     VALUES (?, 'pending', ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    customerId,
    quotation.total_amount,
    quotation.currency,
    JSON.stringify({
      source: 'quotation',
      quotation_id: id,
      quotation_number: quotation.quotation_number,
      customer_company: quotation.customer_company,
      customer_name: quotation.customer_name
    }),
    orderPublicToken
  ).run();

  const orderId = Number(orderRes.meta.last_row_id);

  // Insert order items from quotation items
  for (const item of quotationItems.results) {
    await c.env.DB.prepare(
      `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      orderId,
      item.variant_id,
      item.quantity,
      item.unit_price,
      JSON.stringify({ quotation_item_id: item.id })
    ).run();
  }

  // Update quotation status
  await c.env.DB.prepare(
    `UPDATE quotations SET status = 'accepted', converted_order_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(orderId, id).run();

  // Build Stripe checkout session
  const baseUrl = c.env.STOREFRONT_BASE_URL || 'http://localhost:4321';
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/quotations/${quotation.public_token || id}`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);

  // Add line items
  quotationItems.results.forEach((item: any, index: number) => {
    const row = variantMap.get(item.variant_id)!;
    params.set(`line_items[${index}][price]`, row.provider_price_id!.trim());
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  params.set('metadata[quotation_id]', String(id));
  params.set('payment_intent_data[metadata][orderId]', String(orderId));
  params.set('payment_intent_data[metadata][order_id]', String(orderId));
  params.set('payment_intent_data[metadata][quotation_id]', String(id));
  if (customerEmail) params.set('customer_email', customerEmail);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    console.error(text);
    return jsonError(c, 'Failed to create checkout session', 500);
  }

  const session = await stripeRes.json<any>();
  if (!session?.url || !session?.id) {
    return jsonError(c, 'Invalid checkout session', 500);
  }

  await c.env.DB.prepare(
    `UPDATE orders SET provider_checkout_session_id=?, updated_at=datetime('now') WHERE id=?`
  ).bind(session.id, orderId).run();

  return jsonOk(c, {
    orderId,
    quotationNumber: quotation.quotation_number,
    checkoutUrl: session.url
  });
});

// DELETE /quotations/:id - Delete quotation (admin only, guarded)
quotations.delete('/quotations/:id', async (c) => {
  const adminKey = c.req.header('x-admin-key');
  if (!adminKey || !c.env.ADMIN_API_KEY || !timingSafeCompare(adminKey, c.env.ADMIN_API_KEY)) {
    return jsonError(c, 'Unauthorized', 401);
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 'Invalid quotation ID', 400);
  }

  const quotation = await c.env.DB.prepare(
    `SELECT id, status, converted_order_id FROM quotations WHERE id = ?`
  ).bind(id).first<{ id: number; status: string; converted_order_id: number | null }>();

  if (!quotation) {
    return jsonError(c, 'Quotation not found', 404);
  }

  // Check for associated orders that are not cancelled
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

  // Prevent deletion of accepted quotations
  if (quotation.status === 'accepted') {
    return jsonError(c, 'Cannot delete an accepted quotation', 409);
  }

  // Delete quotation items first, then quotation
  await c.env.DB.prepare(
    `DELETE FROM quotation_items WHERE quotation_id = ?`
  ).bind(id).run();

  await c.env.DB.prepare(
    `DELETE FROM quotations WHERE id = ?`
  ).bind(id).run();

  return jsonOk(c, { deleted: true, id });
});

// GET /quotations - List quotations (for admin)
quotations.get('/quotations', async (c) => {
  const status = c.req.query('status');
  const page = parseInt(c.req.query('page') || '1');
  const perPage = parseInt(c.req.query('perPage') || '20');

  if (page < 1 || perPage < 1 || perPage > 100) {
    return jsonError(c, 'Invalid pagination parameters', 400);
  }

  const offset = (page - 1) * perPage;

  let query = `SELECT * FROM quotations`;
  const params: any[] = [];

  if (status) {
    query += ` WHERE status = ?`;
    params.push(status);
  }

  query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  params.push(perPage, offset);

  const quotations = await c.env.DB.prepare(query).bind(...params).all();

  // Get total count
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
    quotations: quotations.results || [],
    meta: {
      page,
      perPage,
      totalCount,
      totalPages
    }
  });
});

export default quotations;
