-- Add clerk_user_id column to customers table for Clerk authentication integration
-- This enables customers to log in and view their account information

-- Add clerk_user_id column
ALTER TABLE customers ADD COLUMN clerk_user_id TEXT;

-- Create index for fast lookup by Clerk user ID
CREATE INDEX idx_customers_clerk_user_id ON customers(clerk_user_id);
