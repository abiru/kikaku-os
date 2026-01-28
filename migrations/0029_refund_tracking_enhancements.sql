-- Migration: Refund Tracking Enhancements
-- Date: 2026-01-28
-- Purpose: Add indexes for refund query optimization and metadata columns

-- 返金重複チェック用インデックス（既存の可能性あり - IF NOT EXISTS で安全に作成）
CREATE INDEX IF NOT EXISTS idx_refunds_provider_refund_id
  ON refunds(provider_refund_id);

-- 返金クエリ最適化用インデックス
CREATE INDEX IF NOT EXISTS idx_refunds_payment_status
  ON refunds(payment_id, status);

CREATE INDEX IF NOT EXISTS idx_refunds_created_at
  ON refunds(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_created
  ON order_status_history(created_at DESC);

-- 返金メタデータ保存用カラム追加
-- Stripe返金理由 (duplicate, fraudulent, requested_by_customer, etc.)
ALTER TABLE refunds ADD COLUMN stripe_reason TEXT;

-- Stripeレシート番号
ALTER TABLE refunds ADD COLUMN receipt_number TEXT;

-- 返金失敗時の理由
ALTER TABLE refunds ADD COLUMN failure_reason TEXT;
