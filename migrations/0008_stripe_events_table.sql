CREATE TABLE IF NOT EXISTS stripe_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_created INTEGER,
  payload_json TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripe_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
