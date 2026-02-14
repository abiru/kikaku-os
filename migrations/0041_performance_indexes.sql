-- Add missing database indexes for common queries
-- Improves performance for order lookups, webhook reconciliation,
-- and reporting queries.

-- orders: customer order lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON orders(customer_id);

-- orders: date-range queries on payment date
CREATE INDEX IF NOT EXISTS idx_orders_paid_at
  ON orders(paid_at)
  WHERE paid_at IS NOT NULL;

-- order_items: product sales queries by variant
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON order_items(variant_id);

-- payments: payment lookups by order
CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON payments(order_id);

-- ledger_entries: date-range queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at
  ON ledger_entries(created_at);
