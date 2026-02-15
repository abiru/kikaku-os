/**
 * Quotation business logic extracted from the quotation route handlers.
 *
 * Keeps route handlers thin: parse input, call service, return response.
 */

import { calculateOrderTax, type TaxCalculationInput } from './tax';
import { ensureStripePriceForVariant } from './stripe';
import { generatePublicToken } from '../lib/token';
import type { ErrorStatusCode } from '../lib/http';
import type { CheckoutItem, VariantPriceRow } from '../lib/schemas/checkout';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function fetchVariantPriceMap(
  db: D1Database,
  variantIds: number[],
  opts: { withTaxRate?: boolean; withProviderIds?: boolean } = {}
): Promise<Map<number, VariantPriceRow>> {
  const placeholders = variantIds.map(() => '?').join(',');

  const taxJoin = opts.withTaxRate
    ? 'LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id'
    : '';
  const taxCol = opts.withTaxRate ? ', tr.rate as tax_rate' : '';
  const providerCols = opts.withProviderIds
    ? ', p.provider_product_id as provider_product_id, pr.provider_price_id as provider_price_id'
    : '';

  const { results } = await db.prepare(
    `SELECT v.id as variant_id,
            v.title as variant_title,
            v.product_id as product_id,
            p.title as product_title,
            pr.id as price_id,
            pr.amount as amount,
            pr.currency as currency
            ${taxCol}${providerCols}
     FROM variants v
     JOIN products p ON p.id = v.product_id
     JOIN prices pr ON pr.variant_id = v.id
     ${taxJoin}
     WHERE v.id IN (${placeholders})
     ORDER BY pr.id DESC`
  ).bind(...variantIds).all<VariantPriceRow>();

  const variantMap = new Map<number, VariantPriceRow>();
  for (const row of results || []) {
    if (!variantMap.has(row.variant_id)) {
      variantMap.set(row.variant_id, row);
    }
  }
  return variantMap;
}

// ---------------------------------------------------------------------------
// Create quotation
// ---------------------------------------------------------------------------

export type CreateQuotationInput = {
  customerCompany: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  items: CheckoutItem[];
};

export type CreateQuotationOutput = {
  id: number;
  publicToken: string;
  quotationNumber: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  validUntil: string;
};

export async function createQuotation(
  db: D1Database,
  input: CreateQuotationInput
): Promise<CreateQuotationOutput> {
  const { customerCompany, customerName, customerEmail, customerPhone, notes, items } = input;

  const variantIds = items.map((i) => i.variantId);
  const variantMap = await fetchVariantPriceMap(db, variantIds, { withTaxRate: true });

  // Validate all variants exist
  for (const item of items) {
    if (!variantMap.has(item.variantId)) {
      throw new QuotationError(`Variant ${item.variantId} not found`, 404);
    }
  }

  // Calculate totals
  const taxInputs: TaxCalculationInput[] = items.map((item) => {
    const row = variantMap.get(item.variantId)!;
    return { unitPrice: row.amount, quantity: item.quantity, taxRate: row.tax_rate ?? 0.10 };
  });

  const taxCalc = calculateOrderTax(taxInputs);
  const { subtotal, taxAmount, totalAmount } = taxCalc;

  const firstRow = variantMap.get(items[0]!.variantId);
  const currency = (firstRow?.currency || 'JPY').toUpperCase();

  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntil = validUntilDate.toISOString().split('T')[0]!;

  const publicToken = generatePublicToken();

  const quotationRes = await db.prepare(
    `INSERT INTO quotations (
      quotation_number, customer_company, customer_name, customer_email, customer_phone,
      subtotal, tax_amount, total_amount, currency, valid_until, status, notes,
      public_token, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    'TEMP', customerCompany, customerName, customerEmail, customerPhone,
    subtotal, taxAmount, totalAmount, currency, validUntil, notes, publicToken
  ).run();

  const quotationId = Number(quotationRes.meta.last_row_id);
  const quotationNumber = `EST-${String(quotationId).padStart(4, '0')}`;

  await db.prepare(
    `UPDATE quotations SET quotation_number = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(quotationNumber, quotationId).run();

  for (const item of items) {
    const row = variantMap.get(item.variantId)!;
    const itemSubtotal = row.amount * item.quantity;
    await db.prepare(
      `INSERT INTO quotation_items (
        quotation_id, variant_id, product_title, variant_title, quantity, unit_price, subtotal,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(quotationId, item.variantId, row.product_title, row.variant_title, item.quantity, row.amount, itemSubtotal).run();
  }

  return { id: quotationId, publicToken, quotationNumber, subtotal, taxAmount, totalAmount, currency, validUntil };
}

// ---------------------------------------------------------------------------
// Accept quotation
// ---------------------------------------------------------------------------

type QuotationRow = {
  id: number;
  quotation_number: string;
  customer_company: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  valid_until: string;
  status: string;
  notes: string | null;
  public_token: string;
  converted_order_id: number | null;
  created_at: string;
  updated_at: string;
};

type QuotationItemRow = {
  id: number;
  quotation_id: number;
  variant_id: number;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
  updated_at: string;
};

export type AcceptQuotationOutput = {
  orderId: number;
  quotationNumber: string;
  checkoutUrl: string;
};

type StripeCheckoutSessionResponse = {
  id?: string;
  url?: string;
};

export async function acceptQuotation(
  db: D1Database,
  stripeKey: string,
  baseUrl: string,
  token: string,
  email: string | null
): Promise<AcceptQuotationOutput> {
  const quotation = await db.prepare(
    `SELECT id, quotation_number, customer_company, customer_name, customer_email, customer_phone,
            subtotal, tax_amount, total_amount, currency, valid_until, status, notes,
            public_token, converted_order_id, created_at, updated_at
     FROM quotations WHERE public_token = ?`
  ).bind(token).first<QuotationRow>();

  if (!quotation) {
    throw new QuotationError('Quotation not found', 404);
  }

  if (quotation.status !== 'draft' && quotation.status !== 'sent') {
    throw new QuotationError(`Cannot accept quotation with status: ${quotation.status}`, 400);
  }

  if (new Date() > new Date(quotation.valid_until)) {
    throw new QuotationError('Quotation has expired', 400);
  }

  const quotationItems = await db.prepare(
    `SELECT id, quotation_id, variant_id, product_title, variant_title, quantity, unit_price, subtotal, created_at, updated_at
     FROM quotation_items WHERE quotation_id = ? ORDER BY id`
  ).bind(quotation.id).all<QuotationItemRow>();

  if (!quotationItems.results || quotationItems.results.length === 0) {
    throw new QuotationError('No items in quotation', 400);
  }

  // Fetch variants with provider IDs for Stripe
  const variantIds = quotationItems.results.map((item) => item.variant_id);
  const variantMap = await fetchVariantPriceMap(db, variantIds, { withProviderIds: true });

  // Ensure Stripe prices exist
  for (const item of quotationItems.results) {
    const row = variantMap.get(item.variant_id);
    if (!row) {
      throw new QuotationError(`Variant ${item.variant_id} not found`, 404);
    }
    if (!row.provider_price_id?.trim()) {
      const stripePriceId = await ensureStripePriceForVariant(db, stripeKey, row);
      variantMap.set(item.variant_id, { ...row, provider_price_id: stripePriceId });
    }
  }

  // Customer handling
  const customerEmail = email || quotation.customer_email;
  let customerId: number | null = null;
  if (customerEmail) {
    const existing = await db.prepare(
      `SELECT id FROM customers WHERE email=?`
    ).bind(customerEmail).first<{ id: number }>();

    if (existing?.id) {
      customerId = existing.id;
    } else {
      const res = await db.prepare(
        `INSERT INTO customers (name, email, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      ).bind(quotation.customer_company, customerEmail).run();
      customerId = Number(res.meta.last_row_id);
    }
  }

  // Create order
  const orderPublicToken = generatePublicToken();
  const orderRes = await db.prepare(
    `INSERT INTO orders (customer_id, status, total_net, total_fee, currency, metadata, public_token, created_at, updated_at)
     VALUES (?, 'pending', ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    customerId,
    quotation.total_amount,
    quotation.currency,
    JSON.stringify({
      source: 'quotation',
      quotation_id: quotation.id,
      quotation_number: quotation.quotation_number,
      customer_company: quotation.customer_company,
      customer_name: quotation.customer_name
    }),
    orderPublicToken
  ).run();

  const orderId = Number(orderRes.meta.last_row_id);

  for (const item of quotationItems.results) {
    await db.prepare(
      `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(orderId, item.variant_id, item.quantity, item.unit_price, JSON.stringify({ quotation_item_id: item.id })).run();
  }

  // Update quotation status
  await db.prepare(
    `UPDATE quotations SET status = 'accepted', converted_order_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(orderId, quotation.id).run();

  // Create Stripe checkout session
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/quotations/${quotation.public_token}`;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);

  quotationItems.results.forEach((item, index) => {
    const row = variantMap.get(item.variant_id)!;
    params.set(`line_items[${index}][price]`, row.provider_price_id!.trim());
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  params.set('metadata[orderId]', String(orderId));
  params.set('metadata[order_id]', String(orderId));
  params.set('metadata[quotation_id]', String(quotation.id));
  params.set('payment_intent_data[metadata][orderId]', String(orderId));
  params.set('payment_intent_data[metadata][order_id]', String(orderId));
  params.set('payment_intent_data[metadata][quotation_id]', String(quotation.id));
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
    throw new QuotationError('Failed to create checkout session', 500);
  }

  const session = await stripeRes.json<StripeCheckoutSessionResponse>();
  if (!session?.url || !session?.id) {
    throw new QuotationError('Invalid checkout session', 500);
  }

  await db.prepare(
    `UPDATE orders SET provider_checkout_session_id=?, updated_at=datetime('now') WHERE id=?`
  ).bind(session.id, orderId).run();

  return { orderId, quotationNumber: quotation.quotation_number, checkoutUrl: session.url };
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class QuotationError extends Error {
  constructor(
    message: string,
    public readonly status: ErrorStatusCode
  ) {
    super(message);
    this.name = 'QuotationError';
  }
}
