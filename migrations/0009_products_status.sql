-- Add status column to products table
ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'active';
