-- Add public tokens for secure access to orders and quotations
-- Prevents sequential ID enumeration attacks

ALTER TABLE orders ADD COLUMN public_token TEXT;
ALTER TABLE quotations ADD COLUMN public_token TEXT;

-- Create indexes for token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON orders(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_public_token ON quotations(public_token);
