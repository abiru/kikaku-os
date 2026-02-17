# D1 Migration Rollback Strategy

## Overview

Migrations are applied via `wrangler d1 migrations apply` during the deploy workflow.
D1 does **not** support transactional DDL or native rollback, so recovery relies on
Point-in-Time Recovery (PITR) and manual rollback SQL.

## Prevention: Pre-deploy Checks

1. **Local dry-run** before merging:
   ```bash
   pnpm db:migrate          # applies to local D1
   pnpm -C apps/api test    # verify app works with new schema
   ```

2. **CI validates** migrations compile (part of `pnpm -C apps/api build`)

3. **deploy.yml** applies migrations **before** deploying code. If migration fails,
   the deployment is aborted and a Slack alert is sent.

## Recovery Procedures

### Scenario 1: Migration Failed Mid-way (Partial Apply)

The deploy workflow will stop. The database may be in a partial state.

**Steps:**
1. Check the GitHub Actions log to identify which migration failed
2. Connect to D1 to inspect state:
   ```bash
   wrangler d1 execute ledkikaku-os --remote --command "SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 5"
   ```
3. If the failed migration created tables/columns, manually drop them:
   ```bash
   wrangler d1 execute ledkikaku-os --remote --command "DROP TABLE IF EXISTS <table_name>"
   ```
4. Fix the migration SQL, commit, and re-deploy

### Scenario 2: Migration Succeeded but App is Broken

The new schema is live but the code doesn't work correctly with it.

**Option A: Roll forward (preferred)**
- Fix the code, push a new commit, let CI/CD redeploy

**Option B: Use D1 Point-in-Time Recovery**
- D1 supports PITR up to 30 days (Workers Paid plan)
- Restore to a timestamp before the migration:
  ```bash
  wrangler d1 time-travel restore ledkikaku-os --timestamp=2026-01-15T00:00:00Z
  ```
- Then redeploy the previous code version:
  ```bash
  git revert <commit>
  git push origin main
  ```

### Scenario 3: Destructive Migration (Column/Table Dropped)

**Prevention (CRITICAL):**
- Never drop columns/tables in the same PR that removes code using them
- Use a two-phase approach:
  1. **Phase 1**: Deploy code that no longer uses the column (but column still exists)
  2. **Phase 2**: Drop the column in a separate migration after Phase 1 is stable

**Recovery:**
- Use D1 PITR to restore the database to before the drop
- Redeploy the previous code version

## Rollback SQL Convention

For critical migrations, create a corresponding rollback file:

```
migrations/
  0050_drop_redundant_indexes.sql
  0050_drop_redundant_indexes.rollback.sql   # <-- rollback
```

Rollback files are not auto-executed. They serve as documentation for manual recovery.

### Example Rollback

**Migration** (`0053_add_loyalty_points.sql`):
```sql
ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;
CREATE INDEX idx_customers_loyalty ON customers(loyalty_points);
```

**Rollback** (`0053_add_loyalty_points.rollback.sql`):
```sql
DROP INDEX IF EXISTS idx_customers_loyalty;
-- Note: D1/SQLite does not support DROP COLUMN.
-- Use PITR if column removal is needed.
```

## D1 Limitations

- **No `DROP COLUMN`** in SQLite — must recreate table or use PITR
- **No transactional DDL** — each statement commits immediately
- **PITR requires Workers Paid plan** — 30-day retention
- **`d1_migrations` table** tracks applied migrations — do not modify manually

## Emergency Contacts

- Cloudflare D1 Status: https://www.cloudflarestatus.com/
- Cloudflare Support: Requires paid plan for priority support
- Internal: Check `#ops` Slack channel for incident response
