ALTER TABLE inbox_items ADD COLUMN kind TEXT;
ALTER TABLE inbox_items ADD COLUMN date TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_kind_date ON inbox_items(kind, date);
