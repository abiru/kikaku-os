# D1 Backup & Restore Guide

## Backup Strategy

Led Kikaku OS uses a dual-layer backup approach:

| Layer | Frequency | Retention | Method |
|-------|-----------|-----------|--------|
| D1 PITR | Continuous | 30 days | Cloudflare native (Workers Paid) |
| Weekly export | Sunday 00:00 UTC | 56 days (R2) + 30 days (artifact) | `scripts/backup-db.sh` via GitHub Actions |

## Automated Weekly Backup

**Workflow**: `.github/workflows/backup.yml`

- Runs every Sunday at midnight UTC
- Exports all D1 tables to SQL dump
- Uploads to GitHub Actions artifacts (30-day retention)
- Optionally cleans old R2 backups (56-day retention)

### Manual Trigger

```bash
gh workflow run backup.yml
```

## Restore Procedures

### Option 1: D1 Point-in-Time Recovery (Fastest)

Best for: Recent data loss, accidental migrations, corruption within 30 days.

```bash
# List available restore points
wrangler d1 time-travel info ledkikaku-os

# Restore to specific timestamp
wrangler d1 time-travel restore ledkikaku-os \
  --timestamp=2026-01-15T00:00:00Z

# Restore to specific bookmark (from time-travel info output)
wrangler d1 time-travel restore ledkikaku-os \
  --bookmark=<bookmark-id>
```

**RTO**: ~1-5 minutes
**RPO**: Seconds (continuous replication)

### Option 2: Restore from Weekly Export

Best for: When PITR window has passed (>30 days) or for data verification.

1. **Download the backup artifact** from GitHub Actions:
   ```bash
   gh run download <run-id> -n db-backup-<run-id>
   ```

2. **Extract the backup**:
   ```bash
   tar xzf backups/ledkikaku-*.tar.gz
   ```

3. **Apply to a test database first**:
   ```bash
   # Create a temporary D1 database for testing
   wrangler d1 create ledkikaku-restore-test

   # Apply the SQL dump
   wrangler d1 execute ledkikaku-restore-test --remote --file=backup.sql
   ```

4. **Verify data integrity**:
   ```bash
   wrangler d1 execute ledkikaku-restore-test --remote \
     --command "SELECT COUNT(*) as orders FROM orders"
   wrangler d1 execute ledkikaku-restore-test --remote \
     --command "SELECT COUNT(*) as products FROM products"
   ```

5. **If verified, restore to production**:
   ```bash
   # WARNING: This overwrites production data
   wrangler d1 execute ledkikaku-os --remote --file=backup.sql
   ```

**RTO**: ~10-30 minutes
**RPO**: Up to 7 days (weekly backup interval)

### Option 3: Stripe as Source of Truth (Financial Data)

For payment/order data, Stripe is the authoritative source:

1. Export from Stripe Dashboard: Payments > Export
2. Reconcile with D1 data using `order.provider_payment_intent_id`
3. Re-sync via webhook replay if needed

## Monthly Restore Test

**Workflow**: `.github/workflows/backup.yml` (manual trigger)

Run a monthly restore verification:

1. Trigger the backup workflow manually
2. Download the latest backup artifact
3. Restore to a test D1 database
4. Run basic integrity checks (row counts, FK constraints)
5. Delete the test database

### Checklist

- [ ] Backup artifact downloads successfully
- [ ] SQL dump applies without errors
- [ ] Row counts match expected ranges
- [ ] Foreign key constraints are satisfied
- [ ] Orders table has recent entries
- [ ] Products table has expected count

Record results in the GitHub Actions run log and notify `#ops` Slack channel.

## Monitoring

- **Backup workflow failures**: GitHub Actions sends email notification on failure
- **PITR availability**: Check via `wrangler d1 time-travel info ledkikaku-os`
- **R2 backup storage**: Monitor via Cloudflare Dashboard > R2

## Key Metrics

| Metric | Target | Current |
|--------|--------|---------|
| RTO (Recovery Time Objective) | < 30 min | ~5 min (PITR) |
| RPO (Recovery Point Objective) | < 1 hour | Seconds (PITR) / 7 days (export) |
| Backup success rate | 100% | Monitor in GitHub Actions |
| Monthly restore test | Pass | Schedule manually |
