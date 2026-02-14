-- Add UNIQUE constraint on customers.clerk_user_id to prevent duplicate accounts
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_clerk_user_id ON customers(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
