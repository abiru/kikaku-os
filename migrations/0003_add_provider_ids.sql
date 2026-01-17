ALTER TABLE refunds ADD COLUMN provider_refund_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id
  ON payments(provider_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_provider_refund_id
  ON refunds(provider_refund_id);
