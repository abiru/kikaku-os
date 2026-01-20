-- Static pages table for CMS content management
CREATE TABLE IF NOT EXISTS static_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_static_pages_slug ON static_pages(slug);
CREATE INDEX IF NOT EXISTS idx_static_pages_status ON static_pages(status);

-- Insert core static pages as draft (content to be migrated later)
INSERT INTO static_pages (slug, title, meta_title, status, body) VALUES
  ('terms', '利用規約', '利用規約 - Led Kikaku', 'draft', ''),
  ('privacy', 'プライバシーポリシー', 'プライバシーポリシー - Led Kikaku', 'draft', ''),
  ('refund', '返品・返金ポリシー', '返品・返金について - Led Kikaku', 'draft', '');
