-- Add rate_basis_points INTEGER column to tax_rates
-- Basis points avoid floating-point precision issues (1000 = 10%, 800 = 8%)
ALTER TABLE tax_rates ADD COLUMN rate_basis_points INTEGER;

-- Populate from existing REAL rate values
UPDATE tax_rates
SET rate_basis_points = CAST(ROUND(rate * 10000) AS INTEGER)
WHERE rate_basis_points IS NULL;

-- Add rate_basis_points to order_items as well
ALTER TABLE order_items ADD COLUMN tax_rate_basis_points INTEGER;

-- Populate from existing REAL tax_rate values
UPDATE order_items
SET tax_rate_basis_points = CAST(ROUND(tax_rate * 10000) AS INTEGER)
WHERE tax_rate IS NOT NULL AND tax_rate_basis_points IS NULL;
