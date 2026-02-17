-- D1 fallback storage for critical data when R2 is unavailable
CREATE TABLE IF NOT EXISTS r2_fallback_store (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  created_at TEXT DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_r2_fallback_store_key ON r2_fallback_store(r2_key);
CREATE INDEX IF NOT EXISTS idx_r2_fallback_store_synced ON r2_fallback_store(synced_at);
