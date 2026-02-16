-- Restock notification subscriptions
CREATE TABLE IF NOT EXISTS restock_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  notified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_restock_notifications_product_id ON restock_notifications(product_id);
CREATE INDEX IF NOT EXISTS idx_restock_notifications_email ON restock_notifications(email);
