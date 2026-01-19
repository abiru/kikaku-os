-- Daily close execution tracking
CREATE TABLE IF NOT EXISTS daily_close_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                          -- YYYY-MM-DD
    status TEXT NOT NULL DEFAULT 'pending',       -- pending, running, success, failed
    started_at TEXT,                             -- ISO timestamp
    completed_at TEXT,                           -- ISO timestamp
    error_message TEXT,                          -- Error details if failed
    artifacts_generated INTEGER DEFAULT 0,        -- Count of artifacts generated
    ledger_entries_created INTEGER DEFAULT 0,     -- Count of ledger entries created
    anomaly_detected INTEGER DEFAULT 0,           -- 1 if anomaly was detected
    forced INTEGER DEFAULT 0,                     -- 1 if this was a forced re-run
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, started_at)                      -- Allow multiple runs per date
);

CREATE INDEX IF NOT EXISTS idx_daily_close_runs_date ON daily_close_runs(date);
CREATE INDEX IF NOT EXISTS idx_daily_close_runs_status ON daily_close_runs(status);
