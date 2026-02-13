-- Add Stripe product id to products table for auto-creation
ALTER TABLE products ADD COLUMN provider_product_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_provider_product_id
  ON products(provider_product_id);
