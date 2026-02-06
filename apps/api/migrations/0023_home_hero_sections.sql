-- Create table for homepage hero sections
CREATE TABLE IF NOT EXISTS home_hero_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_r2_key TEXT,
  image_r2_key_small TEXT,
  cta_primary_text TEXT,
  cta_primary_url TEXT,
  cta_secondary_text TEXT,
  cta_secondary_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_home_hero_status_position
  ON home_hero_sections(status, position);

-- Insert initial hero sections from existing hardcoded content
INSERT INTO home_hero_sections (title, subtitle, position, status, cta_primary_text, cta_primary_url)
VALUES
  ('スペシャルなギフト。お急ぎください。', '魔法みたいな瞬間をあの人に届けましょう。', 1, 'active', '商品を見る', '/products'),
  ('純米大吟醸', '華やかな香りで特別な一杯を。', 2, 'active', '商品を見る', '/products'),
  ('生酛仕込み', 'しっとりとした旨味と奥行き。', 3, 'active', '商品を見る', '/products');
