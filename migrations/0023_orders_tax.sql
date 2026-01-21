-- Migration: Add tax breakdown to orders
-- Purpose: Store subtotal, tax_amount, and total_amount separately for transparency
-- Date: 2026-01-21

ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN total_amount INTEGER NOT NULL DEFAULT 0;

-- Backfill existing orders (reverse-calculate from total_net assuming 10% tax-inclusive)
-- Formula: subtotal = total_net / 1.10, tax_amount = total_net - subtotal
UPDATE orders
SET
  subtotal = CAST(total_net / 1.10 AS INTEGER),
  tax_amount = total_net - CAST(total_net / 1.10 AS INTEGER),
  total_amount = total_net - total_discount + shipping_fee
WHERE subtotal = 0;
