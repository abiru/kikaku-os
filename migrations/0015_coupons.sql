-- Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value INTEGER NOT NULL,
  currency TEXT DEFAULT 'JPY',
  min_order_amount INTEGER DEFAULT 0,
  max_uses INTEGER,
  uses_per_customer INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);

-- Coupon usages tracking table
CREATE TABLE IF NOT EXISTS coupon_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  discount_amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(coupon_id) REFERENCES coupons(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_customer ON coupon_usages(customer_id);
