-- Add unique constraints for idempotent daily close operations

-- Documents: ensure (ref_type, ref_id, path) combination is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_ref_path
  ON documents(ref_type, ref_id, path);

-- Ledger entries: prevent duplicate journal entries for same daily close
-- Each entry is identified by ref_type, ref_id, account_id, and memo
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_unique
  ON ledger_entries(ref_type, ref_id, account_id, memo);
