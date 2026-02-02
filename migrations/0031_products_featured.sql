-- Add featured column to products table for homepage category grid
ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 0;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_products_featured
  ON products(featured, status, category);

-- Set one product per category as featured (for initial data)
-- This selects the earliest created product in each category
UPDATE products
SET featured = 1
WHERE id IN (
  SELECT MIN(id)
  FROM products
  WHERE status = 'active' AND category IS NOT NULL
  GROUP BY category
  LIMIT 6
);
