-- Add category column to products table for filtering
ALTER TABLE products ADD COLUMN category TEXT DEFAULT NULL;
CREATE INDEX idx_products_category ON products(category);
