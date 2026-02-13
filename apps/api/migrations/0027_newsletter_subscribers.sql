-- Newsletter subscribers table
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers(status);
