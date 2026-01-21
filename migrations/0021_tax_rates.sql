-- Migration: Create tax_rates table
-- Purpose: Store tax rate master data (standard 10%, reduced 8%)
-- Date: 2026-01-21

CREATE TABLE IF NOT EXISTS tax_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  applicable_from TEXT NOT NULL,
  applicable_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_active ON tax_rates(is_active, applicable_from);

-- Seed initial Japanese consumption tax rates
INSERT INTO tax_rates (name, rate, applicable_from, is_active, description)
VALUES
  ('Standard Rate', 0.10, '2019-10-01', 1, 'Standard consumption tax (10%)'),
  ('Reduced Rate', 0.08, '2019-10-01', 1, 'Reduced rate for food/beverages (8%)');
