-- Migration: Add tax details to order items
-- Purpose: Track tax rate and amount per line item for audit trail
-- Date: 2026-01-21

ALTER TABLE order_items ADD COLUMN tax_rate REAL;
ALTER TABLE order_items ADD COLUMN tax_amount INTEGER;

-- Backfill existing items (assume 10% tax-inclusive pricing)
-- Formula: tax_amount = (unit_price * quantity) - ((unit_price * quantity) / 1.10)
UPDATE order_items
SET
  tax_rate = 0.10,
  tax_amount = (unit_price * quantity) - CAST((unit_price * quantity) / 1.10 AS INTEGER)
WHERE tax_rate IS NULL;
