-- Google Ads Drafts and Generation History

-- Ad drafts table
CREATE TABLE IF NOT EXISTS ad_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL,
  ad_type TEXT NOT NULL DEFAULT 'search',  -- 'search' | 'display' | 'performance_max'
  status TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'ready'
  language TEXT NOT NULL DEFAULT 'ja',      -- 'ja' | 'en'

  -- Product context (optional FK to products table)
  product_id INTEGER,
  product_name TEXT,
  product_description TEXT,
  target_audience TEXT,

  -- Ad content (JSON arrays)
  headlines TEXT,      -- JSON array of strings (max 15 items)
  descriptions TEXT,   -- JSON array of strings (max 4 items)
  keywords TEXT,       -- JSON array of strings

  -- Ad settings
  final_url TEXT NOT NULL,
  daily_budget INTEGER,
  tone TEXT,           -- 'professional' | 'casual' | 'urgent' | 'informative'

  -- AI context
  last_prompt TEXT,    -- Last generation prompt used

  -- Metadata
  metadata TEXT,       -- Extensible JSON

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_ad_drafts_status ON ad_drafts(status);
CREATE INDEX IF NOT EXISTS idx_ad_drafts_product_id ON ad_drafts(product_id);
CREATE INDEX IF NOT EXISTS idx_ad_drafts_updated_at ON ad_drafts(updated_at);

-- Ad generation history table
CREATE TABLE IF NOT EXISTS ad_generation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER,

  -- Generation input
  prompt TEXT NOT NULL,

  -- Generation output (JSON with candidates)
  generated_content TEXT NOT NULL,  -- JSON: { candidates: [{ headlines, descriptions, suggestedKeywords }] }

  -- Selection tracking
  selected INTEGER NOT NULL DEFAULT 0,  -- 0 or 1

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY(draft_id) REFERENCES ad_drafts(id)
);

CREATE INDEX IF NOT EXISTS idx_ad_generation_history_draft_id ON ad_generation_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_ad_generation_history_created_at ON ad_generation_history(created_at);
