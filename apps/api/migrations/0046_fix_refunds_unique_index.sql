-- Fix: migration 0033 created a non-UNIQUE index with same name as
-- the UNIQUE index from migration 0003. On new databases this could
-- result in losing the UNIQUE constraint on provider_refund_id.
-- Drop and recreate as UNIQUE to ensure constraint is enforced.

DROP INDEX IF EXISTS idx_refunds_provider_refund_id;
CREATE UNIQUE INDEX idx_refunds_provider_refund_id ON refunds(provider_refund_id);
