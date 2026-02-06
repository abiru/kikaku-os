-- Add clerk_user_id column to customers table for linking Clerk authenticated users
ALTER TABLE customers ADD COLUMN clerk_user_id TEXT;

-- Create index for efficient lookup by clerk_user_id
CREATE INDEX IF NOT EXISTS idx_customers_clerk_user_id ON customers(clerk_user_id);
