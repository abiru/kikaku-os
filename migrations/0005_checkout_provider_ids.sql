-- Add checkout/payment provider ids for storefront flow
ALTER TABLE orders ADD COLUMN provider_checkout_session_id TEXT;
ALTER TABLE orders ADD COLUMN provider_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_provider_checkout_session
  ON orders(provider_checkout_session_id);

-- Add Stripe price id on prices
ALTER TABLE prices ADD COLUMN provider_price_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_provider_price_id
  ON prices(provider_price_id);
