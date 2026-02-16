import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createQuotation,
  acceptQuotation,
  fetchVariantPriceMap,
  QuotationError,
} from '../../services/quotation';

// Mock dependencies
vi.mock('../../services/stripe', () => ({
  ensureStripePriceForVariant: vi.fn(),
}));

vi.mock('../../lib/token', () => ({
  generatePublicToken: vi.fn(() => 'mock-public-token-abc'),
}));

import { ensureStripePriceForVariant } from '../../services/stripe';
import { generatePublicToken } from '../../lib/token';

// ---------------------------------------------------------------------------
// DB mock helper
// ---------------------------------------------------------------------------

type MockResults = {
  all: Array<{ results: unknown[] }>;
  first: unknown[];
  run: Array<{ meta: { last_row_id: number }; success: boolean }>;
};

const createMockDb = () => {
  const callCounts = { all: 0, first: 0, run: 0 };
  const mockResults: MockResults = { all: [], first: [], run: [] };

  const mockAll = vi.fn(() => {
    const result = mockResults.all[callCounts.all] ?? { results: [] };
    callCounts.all++;
    return Promise.resolve(result);
  });

  const mockFirst = vi.fn(() => {
    const result = mockResults.first[callCounts.first] ?? null;
    callCounts.first++;
    return Promise.resolve(result);
  });

  const mockRun = vi.fn(() => {
    const result = mockResults.run[callCounts.run] ?? { meta: { last_row_id: 1 }, success: true };
    callCounts.run++;
    return Promise.resolve(result);
  });

  const mockBind = vi.fn(() => ({
    all: mockAll,
    first: mockFirst,
    run: mockRun,
  }));

  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    all: mockAll,
    first: mockFirst,
    run: mockRun,
  }));

  return {
    prepare: mockPrepare,
    _setResults: (results: Partial<MockResults>) => {
      if (results.all) mockResults.all = results.all;
      if (results.first) mockResults.first = results.first;
      if (results.run) mockResults.run = results.run;
    },
    _resetCounts: () => {
      callCounts.all = 0;
      callCounts.first = 0;
      callCounts.run = 0;
    },
    _mocks: { mockPrepare, mockBind, mockAll, mockFirst, mockRun },
  } as unknown as D1Database & {
    _setResults: (r: Partial<MockResults>) => void;
    _resetCounts: () => void;
    _mocks: {
      mockPrepare: ReturnType<typeof vi.fn>;
      mockBind: ReturnType<typeof vi.fn>;
      mockAll: ReturnType<typeof vi.fn>;
      mockFirst: ReturnType<typeof vi.fn>;
      mockRun: ReturnType<typeof vi.fn>;
    };
  };
};

const originalFetch = global.fetch;

describe('quotation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // QuotationError
  // -------------------------------------------------------------------------

  describe('QuotationError', () => {
    it('should create error with message and status', () => {
      const err = new QuotationError('not found', 404);
      expect(err.message).toBe('not found');
      expect(err.status).toBe(404);
      expect(err.name).toBe('QuotationError');
    });

    it('should be instanceof Error', () => {
      const err = new QuotationError('bad', 400);
      expect(err).toBeInstanceOf(Error);
    });
  });

  // -------------------------------------------------------------------------
  // fetchVariantPriceMap
  // -------------------------------------------------------------------------

  describe('fetchVariantPriceMap', () => {
    it('should return map of variant_id -> row', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'Default',
                product_id: 10,
                product_title: 'Widget',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
              },
              {
                variant_id: 2,
                variant_title: 'Large',
                product_id: 10,
                product_title: 'Widget',
                price_id: 101,
                amount: 1500,
                currency: 'JPY',
              },
            ],
          },
        ],
      });

      const result = await fetchVariantPriceMap(db, [1, 2]);

      expect(result.size).toBe(2);
      expect(result.get(1)?.amount).toBe(1100);
      expect(result.get(2)?.amount).toBe(1500);
    });

    it('should keep only the first row per variant_id (latest price)', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'Default',
                product_id: 10,
                product_title: 'Widget',
                price_id: 200,
                amount: 2000,
                currency: 'JPY',
              },
              {
                variant_id: 1,
                variant_title: 'Default',
                product_id: 10,
                product_title: 'Widget',
                price_id: 100,
                amount: 1000,
                currency: 'JPY',
              },
            ],
          },
        ],
      });

      const result = await fetchVariantPriceMap(db, [1]);

      expect(result.size).toBe(1);
      expect(result.get(1)?.price_id).toBe(200);
      expect(result.get(1)?.amount).toBe(2000);
    });

    it('should return empty map when no results', async () => {
      const db = createMockDb();
      db._setResults({ all: [{ results: [] }] });

      const result = await fetchVariantPriceMap(db, [999]);

      expect(result.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // createQuotation
  // -------------------------------------------------------------------------

  describe('createQuotation', () => {
    it('should create a quotation with correct totals and tax', async () => {
      const db = createMockDb();

      // fetchVariantPriceMap query
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'Default',
                product_id: 10,
                product_title: 'Widget',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
                tax_rate: 0.10,
              },
            ],
          },
        ],
        // INSERT quotation, UPDATE quotation_number, INSERT quotation_item
        run: [
          { meta: { last_row_id: 42 }, success: true },
          { meta: { last_row_id: 42 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'Acme Corp',
        customerName: 'John Doe',
        customerEmail: 'john@acme.com',
        customerPhone: '03-1234-5678',
        notes: 'Rush order',
        items: [{ variantId: 1, quantity: 2 }],
      });

      expect(result.id).toBe(42);
      expect(result.publicToken).toBe('mock-public-token-abc');
      expect(result.quotationNumber).toBe('EST-0042');
      // 1100 * 2 = 2200 total, subtotal = floor(2200 * 100 / 110) = 2000, tax = 200
      expect(result.totalAmount).toBe(2200);
      expect(result.subtotal).toBe(2000);
      expect(result.taxAmount).toBe(200);
      expect(result.currency).toBe('JPY');
    });

    it('should throw QuotationError when variant not found', async () => {
      const db = createMockDb();
      db._setResults({
        all: [{ results: [] }],
      });

      await expect(
        createQuotation(db, {
          customerCompany: 'Test',
          customerName: 'Test',
          customerEmail: null,
          customerPhone: null,
          notes: null,
          items: [{ variantId: 999, quantity: 1 }],
        })
      ).rejects.toThrow(QuotationError);

      await expect(
        createQuotation(db, {
          customerCompany: 'Test',
          customerName: 'Test',
          customerEmail: null,
          customerPhone: null,
          notes: null,
          items: [{ variantId: 999, quantity: 1 }],
        })
      ).rejects.toThrow('Variant 999 not found');
    });

    it('should handle multiple items with different tax rates', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'Standard Item',
                product_id: 10,
                product_title: 'Gadget',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
                tax_rate: 0.10,
              },
              {
                variant_id: 2,
                variant_title: 'Food Item',
                product_id: 20,
                product_title: 'Snack',
                price_id: 200,
                amount: 540,
                currency: 'JPY',
                tax_rate: 0.08,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 10 }, success: true },
          { meta: { last_row_id: 10 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 2 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'Mixed Corp',
        customerName: 'Jane',
        customerEmail: null,
        customerPhone: null,
        notes: null,
        items: [
          { variantId: 1, quantity: 1 },
          { variantId: 2, quantity: 3 },
        ],
      });

      // Item 1: 1100 * 1 = 1100, subtotal = floor(1100 * 100 / 110) = 1000, tax = 100
      // Item 2: 540 * 3 = 1620, subtotal = floor(1620 * 100 / 108) = 1500, tax = 120
      expect(result.totalAmount).toBe(1100 + 1620);
      expect(result.subtotal).toBe(1000 + 1500);
      expect(result.taxAmount).toBe(100 + 120);
    });

    it('should default tax_rate to 0.10 when null', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'No Tax Rate',
                product_id: 10,
                product_title: 'Thing',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
                tax_rate: null,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 5 }, success: true },
          { meta: { last_row_id: 5 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'Test',
        customerName: 'Test',
        customerEmail: null,
        customerPhone: null,
        notes: null,
        items: [{ variantId: 1, quantity: 1 }],
      });

      // 1100 total, 10% default tax -> subtotal = floor(1100 * 100 / 110) = 1000, tax = 100
      expect(result.subtotal).toBe(1000);
      expect(result.taxAmount).toBe(100);
      expect(result.totalAmount).toBe(1100);
    });

    it('should generate quotation number formatted as EST-XXXX', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'A',
                product_id: 1,
                product_title: 'P',
                price_id: 1,
                amount: 100,
                currency: 'JPY',
                tax_rate: 0.10,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 7 }, success: true },
          { meta: { last_row_id: 7 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'C',
        customerName: 'N',
        customerEmail: null,
        customerPhone: null,
        notes: null,
        items: [{ variantId: 1, quantity: 1 }],
      });

      expect(result.quotationNumber).toBe('EST-0007');
    });

    it('should set valid_until to 30 days from now', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));

      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'A',
                product_id: 1,
                product_title: 'P',
                price_id: 1,
                amount: 100,
                currency: 'JPY',
                tax_rate: 0.10,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'C',
        customerName: 'N',
        customerEmail: null,
        customerPhone: null,
        notes: null,
        items: [{ variantId: 1, quantity: 1 }],
      });

      expect(result.validUntil).toBe('2026-03-19');

      vi.useRealTimers();
    });

    it('should use uppercase currency from first variant', async () => {
      const db = createMockDb();
      db._setResults({
        all: [
          {
            results: [
              {
                variant_id: 1,
                variant_title: 'A',
                product_id: 1,
                product_title: 'P',
                price_id: 1,
                amount: 100,
                currency: 'usd',
                tax_rate: 0.10,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      const result = await createQuotation(db, {
        customerCompany: 'C',
        customerName: 'N',
        customerEmail: null,
        customerPhone: null,
        notes: null,
        items: [{ variantId: 1, quantity: 1 }],
      });

      expect(result.currency).toBe('USD');
    });
  });

  // -------------------------------------------------------------------------
  // acceptQuotation
  // -------------------------------------------------------------------------

  describe('acceptQuotation', () => {
    const setupAcceptMocks = (
      db: ReturnType<typeof createMockDb>,
      overrides?: {
        quotation?: Record<string, unknown> | null;
        items?: unknown[];
        variantMap?: unknown[];
        existingCustomer?: { id: number } | null;
      }
    ) => {
      const quotation = overrides?.quotation !== undefined
        ? overrides.quotation
        : {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'Acme',
            customer_name: 'John',
            customer_email: 'john@acme.com',
            customer_phone: null,
            subtotal: 1000,
            tax_amount: 100,
            total_amount: 1100,
            currency: 'JPY',
            valid_until: '2099-12-31',
            status: 'draft',
            notes: null,
            public_token: 'tok123',
            converted_order_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          };

      const items = overrides?.items ?? [
        {
          id: 1,
          quotation_id: 1,
          variant_id: 10,
          product_title: 'Widget',
          variant_title: 'Default',
          quantity: 1,
          unit_price: 1100,
          subtotal: 1100,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const variantMap = overrides?.variantMap ?? [
        {
          variant_id: 10,
          variant_title: 'Default',
          product_id: 1,
          product_title: 'Widget',
          price_id: 100,
          amount: 1100,
          currency: 'JPY',
          provider_price_id: 'price_existing',
          provider_product_id: 'prod_existing',
        },
      ];

      const existingCustomer = overrides?.existingCustomer !== undefined
        ? overrides.existingCustomer
        : { id: 42 };

      db._setResults({
        // 1. quotation lookup (first)
        // 2. existing customer lookup (first)
        first: [quotation, existingCustomer],
        // 3. quotation items (all)
        // 4. variant price map (all)
        all: [{ results: items }, { results: variantMap }],
        // 5. create order (run)
        // 6. insert order_items (run)
        // 7. update quotation status (run)
        // 8. update order with session id (run)
        run: [
          { meta: { last_row_id: 99 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });
    };

    it('should accept a draft quotation and create checkout session', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/session' }),
      });

      const result = await acceptQuotation(
        db,
        'sk_test_key',
        'https://mystore.com',
        'tok123',
        null
      );

      expect(result.orderId).toBe(99);
      expect(result.quotationNumber).toBe('EST-0001');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/session');
    });

    it('should accept a sent quotation', async () => {
      const db = createMockDb();
      setupAcceptMocks(db, {
        quotation: {
          id: 2,
          quotation_number: 'EST-0002',
          customer_company: 'Corp',
          customer_name: 'Jane',
          customer_email: 'jane@corp.com',
          customer_phone: null,
          subtotal: 2000,
          tax_amount: 200,
          total_amount: 2200,
          currency: 'JPY',
          valid_until: '2099-12-31',
          status: 'sent',
          notes: null,
          public_token: 'tok456',
          converted_order_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test_456', url: 'https://checkout.stripe.com/sent' }),
      });

      const result = await acceptQuotation(
        db,
        'sk_test_key',
        'https://mystore.com',
        'tok456',
        null
      );

      expect(result.orderId).toBe(99);
    });

    it('should throw when quotation not found', async () => {
      const db = createMockDb();
      db._setResults({ first: [null] });

      await expect(
        acceptQuotation(db, 'sk_test_key', 'https://mystore.com', 'nonexistent', null)
      ).rejects.toThrow('Quotation not found');
    });

    it('should throw for invalid status transitions', async () => {
      for (const status of ['accepted', 'rejected', 'expired', 'cancelled']) {
        const db = createMockDb();
        db._setResults({
          first: [
            {
              id: 1,
              quotation_number: 'EST-0001',
              customer_company: 'X',
              customer_name: 'X',
              customer_email: null,
              customer_phone: null,
              subtotal: 100,
              tax_amount: 10,
              total_amount: 110,
              currency: 'JPY',
              valid_until: '2099-12-31',
              status,
              notes: null,
              public_token: 'tok',
              converted_order_id: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        });

        await expect(
          acceptQuotation(db, 'sk_test', 'https://store.com', 'tok', null)
        ).rejects.toThrow(`Cannot accept quotation with status: ${status}`);
      }
    });

    it('should throw when quotation has expired', async () => {
      const db = createMockDb();
      db._setResults({
        first: [
          {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'X',
            customer_name: 'X',
            customer_email: null,
            customer_phone: null,
            subtotal: 100,
            tax_amount: 10,
            total_amount: 110,
            currency: 'JPY',
            valid_until: '2020-01-01',
            status: 'draft',
            notes: null,
            public_token: 'tok',
            converted_order_id: null,
            created_at: '2020-01-01T00:00:00Z',
            updated_at: '2020-01-01T00:00:00Z',
          },
        ],
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok', null)
      ).rejects.toThrow('Quotation has expired');
    });

    it('should throw when quotation has no items', async () => {
      const db = createMockDb();
      db._setResults({
        first: [
          {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'X',
            customer_name: 'X',
            customer_email: null,
            customer_phone: null,
            subtotal: 100,
            tax_amount: 10,
            total_amount: 110,
            currency: 'JPY',
            valid_until: '2099-12-31',
            status: 'draft',
            notes: null,
            public_token: 'tok',
            converted_order_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        all: [{ results: [] }],
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok', null)
      ).rejects.toThrow('No items in quotation');
    });

    it('should throw when variant not found during acceptance', async () => {
      const db = createMockDb();
      db._setResults({
        first: [
          {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'X',
            customer_name: 'X',
            customer_email: null,
            customer_phone: null,
            subtotal: 100,
            tax_amount: 10,
            total_amount: 110,
            currency: 'JPY',
            valid_until: '2099-12-31',
            status: 'draft',
            notes: null,
            public_token: 'tok',
            converted_order_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        all: [
          {
            results: [
              {
                id: 1,
                quotation_id: 1,
                variant_id: 999,
                product_title: 'Missing',
                variant_title: null,
                quantity: 1,
                unit_price: 100,
                subtotal: 100,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
          },
          { results: [] },
        ],
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok', null)
      ).rejects.toThrow('Variant 999 not found');
    });

    it('should call ensureStripePriceForVariant when provider_price_id is missing', async () => {
      const db = createMockDb();
      const mockedEnsureStripe = vi.mocked(ensureStripePriceForVariant);
      mockedEnsureStripe.mockResolvedValueOnce('price_new_stripe');

      db._setResults({
        first: [
          {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'Acme',
            customer_name: 'John',
            customer_email: 'john@acme.com',
            customer_phone: null,
            subtotal: 1000,
            tax_amount: 100,
            total_amount: 1100,
            currency: 'JPY',
            valid_until: '2099-12-31',
            status: 'draft',
            notes: null,
            public_token: 'tok',
            converted_order_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          { id: 42 }, // existing customer
        ],
        all: [
          {
            results: [
              {
                id: 1,
                quotation_id: 1,
                variant_id: 10,
                product_title: 'Widget',
                variant_title: 'Default',
                quantity: 1,
                unit_price: 1100,
                subtotal: 1100,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
          },
          {
            results: [
              {
                variant_id: 10,
                variant_title: 'Default',
                product_id: 1,
                product_title: 'Widget',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
                provider_price_id: null,
                provider_product_id: null,
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 99 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
          { meta: { last_row_id: 1 }, success: true },
        ],
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test_new', url: 'https://checkout.stripe.com/new' }),
      });

      await acceptQuotation(db, 'sk_test', 'https://store.com', 'tok', null);

      expect(mockedEnsureStripe).toHaveBeenCalledOnce();
    });

    it('should create new customer when no existing customer found', async () => {
      const db = createMockDb();

      db._setResults({
        first: [
          {
            id: 1,
            quotation_number: 'EST-0001',
            customer_company: 'NewCorp',
            customer_name: 'Alice',
            customer_email: 'alice@newcorp.com',
            customer_phone: null,
            subtotal: 1000,
            tax_amount: 100,
            total_amount: 1100,
            currency: 'JPY',
            valid_until: '2099-12-31',
            status: 'draft',
            notes: null,
            public_token: 'tok',
            converted_order_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          null, // no existing customer
        ],
        all: [
          {
            results: [
              {
                id: 1,
                quotation_id: 1,
                variant_id: 10,
                product_title: 'Widget',
                variant_title: 'Default',
                quantity: 1,
                unit_price: 1100,
                subtotal: 1100,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
          },
          {
            results: [
              {
                variant_id: 10,
                variant_title: 'Default',
                product_id: 1,
                product_title: 'Widget',
                price_id: 100,
                amount: 1100,
                currency: 'JPY',
                provider_price_id: 'price_ok',
                provider_product_id: 'prod_ok',
              },
            ],
          },
        ],
        run: [
          { meta: { last_row_id: 55 }, success: true }, // new customer
          { meta: { last_row_id: 99 }, success: true }, // order
          { meta: { last_row_id: 1 }, success: true }, // order item
          { meta: { last_row_id: 1 }, success: true }, // quotation update
          { meta: { last_row_id: 1 }, success: true }, // order session update
        ],
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/ok' }),
      });

      const result = await acceptQuotation(
        db,
        'sk_test',
        'https://store.com',
        'tok',
        'alice@newcorp.com'
      );

      expect(result.orderId).toBe(99);
    });

    it('should throw when Stripe checkout session creation fails', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok123', null)
      ).rejects.toThrow('Failed to create checkout session');

      consoleSpy.mockRestore();
    });

    it('should throw when Stripe returns invalid session (no URL)', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test', url: null }),
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok123', null)
      ).rejects.toThrow('Invalid checkout session');
    });

    it('should throw when Stripe returns invalid session (no ID)', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: null, url: 'https://checkout.stripe.com' }),
      });

      await expect(
        acceptQuotation(db, 'sk_test', 'https://store.com', 'tok123', null)
      ).rejects.toThrow('Invalid checkout session');
    });

    it('should use email parameter over quotation email when both exist', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/ok' }),
      });

      await acceptQuotation(
        db,
        'sk_test',
        'https://store.com',
        'tok123',
        'override@example.com'
      );

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain('customer_email=override%40example.com');
    });

    it('should set success and cancel URLs correctly', async () => {
      const db = createMockDb();
      setupAcceptMocks(db);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/ok' }),
      });

      await acceptQuotation(
        db,
        'sk_test',
        'https://myshop.com',
        'tok123',
        null
      );

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = fetchCall[1].body as string;
      expect(body).toContain(encodeURIComponent('https://myshop.com/checkout/success'));
      expect(body).toContain(encodeURIComponent('https://myshop.com/quotations/tok123'));
    });
  });
});
