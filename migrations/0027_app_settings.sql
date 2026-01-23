-- Migration: Application Settings Table
-- Purpose: Store configurable application settings (non-secret)
-- Date: 2026-01-23

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  category TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  description TEXT,
  validation_rules TEXT,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category, display_order);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_key_unique ON app_settings(key);

-- Seed initial settings from current environment variable defaults
INSERT INTO app_settings (key, value, category, data_type, description, display_order) VALUES
  -- Shipping Settings
  ('shipping_fee_amount', '500', 'shipping', 'integer', '基本送料（円）', 1),
  ('free_shipping_threshold', '5000', 'shipping', 'integer', '送料無料になる購入金額の閾値（円）', 2),

  -- Company Information
  ('company_name', '株式会社LED企画', 'company', 'string', '会社名', 10),
  ('company_postal_code', '123-4567', 'company', 'string', '郵便番号', 11),
  ('company_address', '東京都渋谷区...', 'company', 'string', '住所', 12),
  ('company_phone', '03-1234-5678', 'company', 'string', '電話番号', 13),
  ('company_email', 'info@led-kikaku.com', 'company', 'email', 'メールアドレス', 14),
  ('company_logo_url', '', 'company', 'url', 'ロゴURL（オプション）', 15),

  -- Store Settings (future expansion)
  ('store_name', 'LED企画 オンラインストア', 'store', 'string', 'ストア名', 20),
  ('store_description', '', 'store', 'text', 'ストア説明', 21),
  ('maintenance_mode', 'false', 'store', 'boolean', 'メンテナンスモード', 22)
ON CONFLICT(key) DO NOTHING;
