-- Add indexes for foreign key columns used in JOIN queries
-- These columns are frequently used in joins but lack indexes

CREATE INDEX IF NOT EXISTS idx_fulfillments_order_id ON fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
