-- Add Stripe Customer ID tracking to customers table
-- Required for bank transfer payment reconciliation

-- Add stripe_customer_id column (nullable for backward compatibility)
ALTER TABLE customers ADD COLUMN stripe_customer_id TEXT;

-- Unique index to prevent duplicate Stripe Customer IDs
-- Partial index (WHERE clause) allows multiple NULL values
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_stripe_id
  ON customers(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Composite index for faster lookup during checkout
CREATE INDEX IF NOT EXISTS idx_customers_email_stripe
  ON customers(email, stripe_customer_id);
