-- Add indexes for foreign key columns used in JOIN queries
-- Note: order_status_history(order_id) is already indexed by idx_order_status_history_order.

CREATE INDEX IF NOT EXISTS idx_fulfillments_order_id ON fulfillments(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
