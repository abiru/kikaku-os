-- Migration: Add Payment Intent support for Stripe Elements
-- Adds quote tracking and payment intent fields to support embedded checkout

-- Add quote tracking to orders
ALTER TABLE orders ADD COLUMN quote_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_quote_id ON orders(quote_id);

-- Add index for faster payment intent lookup in webhook handler
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent
  ON orders(provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

-- Create checkout_quotes table for server-side quote storage
-- Quotes have 15-minute TTL to prevent stale pricing
CREATE TABLE IF NOT EXISTS checkout_quotes (
  id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  coupon_code TEXT,
  coupon_id INTEGER,
  subtotal INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  cart_total INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL,
  grand_total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id)
);

CREATE INDEX IF NOT EXISTS idx_checkout_quotes_expires
  ON checkout_quotes(expires_at);
