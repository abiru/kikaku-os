-- AI Content Drafts (unified table for all AI-generated content)
CREATE TABLE IF NOT EXISTS ai_content_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,  -- 'product_description', 'email', 'report_summary', 'marketing_copy'
  ref_type TEXT,               -- 'product', 'order', 'daily_close', null
  ref_id INTEGER,

  prompt TEXT NOT NULL,
  generated_content TEXT NOT NULL,  -- JSON with content and metadata
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'

  model_used TEXT,
  tokens_used INTEGER,
  generation_time_ms INTEGER,

  approved_by TEXT,
  approved_at TEXT,
  applied_at TEXT,

  metadata TEXT,  -- JSON for extensibility

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_content_type ON ai_content_drafts(content_type);
CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_status ON ai_content_drafts(status);
CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_ref ON ai_content_drafts(ref_type, ref_id);

-- Vectorize metadata (tracking embeddings stored in Vectorize)
CREATE TABLE IF NOT EXISTS embeddings_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vector_id TEXT NOT NULL UNIQUE,  -- ID in Vectorize
  entity_type TEXT NOT NULL,       -- 'product', 'customer', 'order'
  entity_id INTEGER NOT NULL,

  embedding_type TEXT NOT NULL,    -- 'semantic_search', 'behavior_pattern', 'recommendation'
  dimensions INTEGER NOT NULL,
  model_used TEXT NOT NULL,

  source_text TEXT,                -- Original text that was embedded
  metadata TEXT,                   -- JSON snapshot of entity at embedding time

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings_metadata(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings_metadata(embedding_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_vector_id ON embeddings_metadata(vector_id);

-- Customer behavior embeddings (for recommendation engine)
CREATE TABLE IF NOT EXISTS customer_behavior_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,

  purchase_vector_id TEXT,         -- Reference to Vectorize
  preference_summary TEXT,         -- JSON: categories, price range, frequency

  total_orders INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  avg_order_value INTEGER DEFAULT 0,
  last_purchase_at TEXT,

  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_behavior_customer ON customer_behavior_profiles(customer_id);

-- AI workflow automation logs
CREATE TABLE IF NOT EXISTS ai_workflow_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_type TEXT NOT NULL,     -- 'inbox_triage', 'customer_inquiry', 'price_optimization'
  trigger TEXT NOT NULL,           -- 'scheduled', 'webhook', 'manual'

  input_data TEXT,                 -- JSON
  ai_response TEXT,                -- JSON
  action_taken TEXT,               -- 'inbox_created', 'email_drafted', 'suggestion_made'

  status TEXT NOT NULL,            -- 'success', 'failed', 'pending_approval'
  error_message TEXT,

  tokens_used INTEGER,
  processing_time_ms INTEGER,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_workflow_type ON ai_workflow_logs(workflow_type);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_created ON ai_workflow_logs(created_at);

-- AI rate limiting and cost tracking
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  service TEXT NOT NULL,           -- 'claude', 'embeddings'
  operation TEXT NOT NULL,         -- 'content_generation', 'embedding', 'search'

  request_count INTEGER DEFAULT 1,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost_cents INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_date_service_op
  ON ai_usage_tracking(date, service, operation);
