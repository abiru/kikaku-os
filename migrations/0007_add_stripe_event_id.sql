ALTER TABLE events ADD COLUMN stripe_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_stripe_event_id
  ON events(stripe_event_id);
