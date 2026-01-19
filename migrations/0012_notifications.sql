-- Notifications table for tracking sent notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,           -- 'slack', 'email', 'webhook'
  inbox_item_id INTEGER,           -- 関連する Inbox アイテム
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, sent, failed
  payload TEXT,                    -- 送信内容 (JSON)
  response TEXT,                   -- レスポンス/エラー
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(inbox_item_id) REFERENCES inbox_items(id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications(inbox_item_id);
