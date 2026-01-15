CREATE TABLE IF NOT EXISTS inventory_thresholds (
  variant_id INTEGER PRIMARY KEY,
  threshold INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
