/**
 * Test data factories for creating consistent test fixtures.
 */

export type ProductFixture = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  image: string | null;
  created_at: string;
  updated_at: string;
};

export type VariantFixture = {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  provider_price_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceFixture = {
  id: number;
  variant_id: number;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type OrderFixture = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  customer_email: string | null;
  provider_checkout_session_id: string | null;
  provider_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItemFixture = {
  id: number;
  order_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;
  title: string;
};

let fixtureIdCounter = 1000;

const nextId = () => ++fixtureIdCounter;

const isoNow = () => new Date().toISOString();

/**
 * Creates a product fixture with default values.
 */
export const createProduct = (overrides?: Partial<ProductFixture>): ProductFixture => ({
  id: nextId(),
  title: 'Test Product',
  description: 'A test product description',
  status: 'active',
  image: null,
  created_at: isoNow(),
  updated_at: isoNow(),
  ...overrides
});

/**
 * Creates a variant fixture with default values.
 */
export const createVariant = (overrides?: Partial<VariantFixture>): VariantFixture => ({
  id: nextId(),
  product_id: overrides?.product_id ?? nextId(),
  title: 'Default',
  sku: null,
  provider_price_id: null,
  created_at: isoNow(),
  updated_at: isoNow(),
  ...overrides
});

/**
 * Creates a price fixture with default values.
 */
export const createPrice = (overrides?: Partial<PriceFixture>): PriceFixture => ({
  id: nextId(),
  variant_id: overrides?.variant_id ?? nextId(),
  amount: 2500,
  currency: 'JPY',
  created_at: isoNow(),
  updated_at: isoNow(),
  ...overrides
});

/**
 * Creates an order fixture with default values.
 */
export const createOrder = (overrides?: Partial<OrderFixture>): OrderFixture => ({
  id: nextId(),
  status: 'pending',
  total_net: 2500,
  currency: 'JPY',
  customer_email: 'test@example.com',
  provider_checkout_session_id: null,
  provider_payment_intent_id: null,
  paid_at: null,
  created_at: isoNow(),
  updated_at: isoNow(),
  ...overrides
});

/**
 * Creates an order item fixture with default values.
 */
export const createOrderItem = (overrides?: Partial<OrderItemFixture>): OrderItemFixture => ({
  id: nextId(),
  order_id: overrides?.order_id ?? nextId(),
  variant_id: overrides?.variant_id ?? nextId(),
  quantity: 1,
  unit_price: 2500,
  title: 'Test Product',
  ...overrides
});

/**
 * Creates a complete product with variants and prices.
 */
export const createProductWithVariants = (
  productOverrides?: Partial<ProductFixture>,
  variantCount: number = 1
) => {
  const product = createProduct(productOverrides);
  const variants = Array.from({ length: variantCount }, (_, i) =>
    createVariant({
      product_id: product.id,
      title: variantCount > 1 ? `Variant ${i + 1}` : 'Default'
    })
  );
  const prices = variants.map((v) => createPrice({ variant_id: v.id }));

  return { product, variants, prices };
};

/**
 * Creates a Stripe checkout session event payload.
 */
export const createStripeCheckoutEvent = (
  sessionId: string = 'cs_test_xxx',
  overrides?: {
    paymentIntentId?: string;
    customerEmail?: string;
    amountTotal?: number;
  }
) => ({
  id: `evt_${Date.now()}`,
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: sessionId,
      payment_intent: overrides?.paymentIntentId ?? 'pi_test_xxx',
      customer_email: overrides?.customerEmail ?? 'test@example.com',
      amount_total: overrides?.amountTotal ?? 2500,
      currency: 'jpy',
      metadata: { order_id: '1' }
    }
  }
});

/**
 * Creates a Stripe payment intent succeeded event payload.
 */
export const createStripePaymentIntentEvent = (
  paymentIntentId: string = 'pi_test_xxx',
  overrides?: {
    amount?: number;
    fee?: number;
  }
) => ({
  id: `evt_${Date.now()}`,
  type: 'payment_intent.succeeded',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: paymentIntentId,
      amount: overrides?.amount ?? 2500,
      currency: 'jpy',
      latest_charge: {
        balance_transaction: {
          fee: overrides?.fee ?? 75
        }
      }
    }
  }
});

/**
 * Resets the fixture ID counter (useful for deterministic tests).
 */
export const resetFixtureIds = (startFrom: number = 1000) => {
  fixtureIdCounter = startFrom;
};
