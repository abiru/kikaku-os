-- Add discount and shipping fields to orders table
ALTER TABLE orders ADD COLUMN total_discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN coupon_code TEXT;

-- Index for coupon tracking
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code ON orders(coupon_code);
