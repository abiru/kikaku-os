-- Add partial unique index on customers.email
-- Allows NULL emails (guest checkouts) but prevents duplicate non-null emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
ON customers(email) WHERE email IS NOT NULL;
