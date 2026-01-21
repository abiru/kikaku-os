-- Migration: Add tax configuration to products
-- Purpose: Link products to tax rates (all products are tax-inclusive)
-- Date: 2026-01-21

ALTER TABLE products ADD COLUMN tax_rate_id INTEGER REFERENCES tax_rates(id);

CREATE INDEX IF NOT EXISTS idx_products_tax_rate ON products(tax_rate_id);

-- Backfill: default all existing products to 10% standard tax rate
UPDATE products
SET tax_rate_id = (SELECT id FROM tax_rates WHERE rate = 0.10 LIMIT 1)
WHERE tax_rate_id IS NULL;
