-- Migration: 0020_quotations
-- Description: Add quotations and quotation_items tables for corporate quotation feature

-- quotations: Main quotation records
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT NOT NULL UNIQUE,  -- EST-0001 format
  customer_company TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal INTEGER NOT NULL,              -- Subtotal (excluding tax)
  tax_amount INTEGER NOT NULL,            -- Tax amount (10%)
  total_amount INTEGER NOT NULL,          -- Total (including tax)
  currency TEXT NOT NULL DEFAULT 'JPY',
  valid_until TEXT NOT NULL,              -- Valid until date (YYYY-MM-DD)
  status TEXT NOT NULL DEFAULT 'draft',   -- draft, sent, accepted, expired, cancelled
  converted_order_id INTEGER,             -- ID of the converted order
  notes TEXT,                             -- Additional notes
  metadata TEXT,                          -- JSON for additional data
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(converted_order_id) REFERENCES orders(id)
);

-- quotation_items: Quotation line items
CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  product_title TEXT NOT NULL,            -- Snapshot of product title
  variant_title TEXT,                     -- Snapshot of variant title
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,            -- Unit price (excluding tax)
  subtotal INTEGER NOT NULL,              -- Line subtotal (excluding tax)
  metadata TEXT,                          -- JSON for additional data
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY(variant_id) REFERENCES variants(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_email ON quotations(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_variant ON quotation_items(variant_id);
