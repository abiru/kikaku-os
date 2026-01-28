# Rollback Procedures

Emergency procedures for rolling back production deployments.

## When to Rollback

**Immediate rollback criteria**:
- 🚨 Error rate > 5%
- 🚨 Health check failing (database or R2 unavailable)
- 🚨 Critical functionality broken (payments, checkout, auth)
- 🚨 Data corruption detected
- 🚨 Security vulnerability introduced

**Consider rollback**:
- ⚠️ Performance degradation (response times 2x slower)
- ⚠️ Elevated error rate (1-5%)
- ⚠️ Non-critical features broken
- ⚠️ Monitoring alerts triggered

## Rollback Decision Flow

```
Issue Detected
  ↓
Is it Critical? (payments, auth, data integrity)
  ↓ YES → ROLLBACK IMMEDIATELY (proceed to Worker Rollback)
  ↓ NO
  ↓
Can it be fixed quickly? (< 15 min)
  ↓ YES → Fix forward (patch and deploy)
  ↓ NO → ROLLBACK (proceed to Worker Rollback)
```

## Worker Rollback (API)

### Method 1: Via Wrangler CLI (Fastest)

**List recent deployments**:
```bash
cd /home/abiru/Code/kikaku-os/apps/api
wrangler deployments list --name kikaku-os-api
```

Output shows:
```
Deployment ID          Created On           Version ID
abc123def456           2026-01-28 10:30     v123
xyz789uvw012           2026-01-28 09:15     v122  ← Previous (good) version
```

**Rollback to previous deployment**:
```bash
wrangler rollback --name kikaku-os-api --deployment-id xyz789uvw012
```

Confirm when prompted.

**Verify rollback**:
```bash
curl https://api.your-domain.com/health
```

**Time**: ~2 minutes

### Method 2: Via GitHub Actions (If CLI unavailable)

1. Go to GitHub → Actions → "Deploy to Production"
2. Find last successful run (green checkmark)
3. Click on the run
4. Click "Re-run all jobs"
5. Confirm

**Time**: ~5-10 minutes (includes CI)

### Method 3: Redeploy from Git

**Checkout previous commit**:
```bash
git log --oneline -10  # Find last good commit
git checkout abc123    # Replace with commit hash
pnpm exec wrangler deploy
```

**Return to main**:
```bash
git checkout main
```

**Time**: ~3 minutes

## Storefront Rollback (Pages)

### Via Cloudflare Dashboard

1. **Cloudflare Dashboard** → Pages
2. Select `kikaku-storefront` project
3. Click **Deployments** tab
4. Find last successful deployment
5. Click "..." menu → "Rollback to this deployment"
6. Confirm

**Time**: ~2 minutes

### Via Wrangler

```bash
cd /home/abiru/Code/kikaku-os/apps/storefront

# List deployments
wrangler pages deployment list --project-name=kikaku-storefront

# Rollback (not directly supported - redeploy instead)
git checkout <previous-commit>
pnpm exec wrangler pages deploy dist --project-name=kikaku-storefront
```

## Database Rollback

⚠️ **WARNING**: Database rollback is destructive and should be last resort.

### Schema Rollback

**If recent migration caused issues**, create reverse migration:

Example:
```sql
-- Original migration: 0029_add_column.sql
ALTER TABLE products ADD COLUMN new_field TEXT;

-- Reverse migration: 0030_rollback_add_column.sql
ALTER TABLE products DROP COLUMN new_field;
```

**Apply reverse migration**:
```bash
# Create reverse migration file in /migrations/
wrangler d1 migrations apply ledkikaku-os --remote
```

**Verify**:
```bash
wrangler d1 execute ledkikaku-os --remote \
  --command "PRAGMA table_info(products)"
```

### Data Rollback (from Backup)

**Prerequisites**: Recent backup available (see `scripts/backup-db.sh`)

**Restore process** (table-by-table):

```bash
# Example: Restore orders table
cd /home/abiru/Code/kikaku-os/backups

# Backup current state first
wrangler d1 execute ledkikaku-os --remote \
  --command "SELECT * FROM orders" --json > orders_before_restore.json

# Clear table (DANGEROUS)
wrangler d1 execute ledkikaku-os --remote \
  --command "DELETE FROM orders"

# Restore from backup
cat orders_20260128_120000.json | jq -r '.results[] | @json' | while read row; do
  # Parse JSON and build INSERT statement
  # This requires custom script - contact team for restore script
done
```

⚠️ **Data rollback is manual and time-consuming**. Prefer fixing forward.

## Secrets Rollback

If secrets were rotated during deployment:

**List secrets**:
```bash
wrangler secret list
```

**Update secret** (if rotation caused issue):
```bash
echo "old_secret_value" | wrangler secret put SECRET_NAME
```

**Common secrets to check**:
- `STRIPE_SECRET_KEY` - Wrong key (test vs live)
- `STRIPE_WEBHOOK_SECRET` - Mismatch with Stripe
- `CLERK_SECRET_KEY` - Wrong environment

## Configuration Rollback

**Revert wrangler.toml**:
```bash
git diff HEAD wrangler.toml  # Check changes
git checkout HEAD~1 wrangler.toml  # Revert to previous
pnpm exec wrangler deploy
```

**Revert environment variables**:
Update `[vars]` section in `wrangler.toml` and redeploy.

## Incident Response Workflow

### 1. Assess (0-2 min)

- **Check monitoring**: Cloudflare Analytics, error rate
- **Check health endpoint**: `curl https://api.your-domain.com/health`
- **Check logs**: `wrangler tail kikaku-os-api`
- **Identify root cause**: Deployment? Database? External service?

### 2. Communicate (2-3 min)

- **Notify team** (Slack, Discord, etc.):
  ```
  🚨 INCIDENT: Production API experiencing errors
  Status: Investigating
  Impact: [checkout broken / elevated errors / ...]
  ETA: Rolling back in 5 min
  ```

- **Create incident doc** (Google Doc, Notion, etc.):
  - Incident start time
  - Symptoms observed
  - Actions taken
  - Resolution status

### 3. Mitigate (3-8 min)

**If deployment-related**:
- Rollback worker (Method 1 - fastest)
- Verify health endpoint returns OK
- Test critical flows (checkout, auth)

**If not deployment-related**:
- Check external dependencies (Stripe API, Clerk)
- Check database (run manual query)
- Check R2 bucket access

### 4. Verify (8-10 min)

- Run smoke tests: `./scripts/smoke-test-prod.sh`
- Check error rate returned to normal
- Test affected functionality manually
- Monitor for 10-15 minutes

### 5. Document (10-20 min)

Update incident doc:
- Root cause identified
- Resolution applied
- Timeline of events
- Verification completed

**Notify team**:
```
✅ RESOLVED: Production API rolled back
Status: Stable
Root cause: [bad migration / config error / ...]
Next steps: Fix in dev, redeploy tomorrow
```

### 6. Post-Mortem (1-2 days later)

Schedule post-mortem meeting:
- What happened?
- Why did it happen?
- How did we detect it?
- How did we fix it?
- How do we prevent it?

**Action items**:
- [ ] Add test coverage for issue
- [ ] Improve monitoring/alerts
- [ ] Update deployment checklist
- [ ] Document lessons learned

## Preventing Rollbacks

**Before deployment**:
- ✅ Run full test suite (`pnpm -C apps/api test`)
- ✅ Test locally with production-like data
- ✅ Review all code changes
- ✅ Check migration compatibility
- ✅ Verify secrets are correct

**Deployment best practices**:
- 🕐 Deploy during low-traffic periods
- 👀 Monitor deployment actively (don't deploy and leave)
- 📊 Check metrics immediately after deployment
- ⏱️ Wait 5-10 min before considering deployment successful

**Staging environment**:
- Create staging environment (copy of production)
- Test all changes in staging first
- Smoke test staging before production deployment

## Rollback Testing

**Quarterly**, practice rollback procedures:

1. Deploy a test change to production
2. Immediately roll it back
3. Verify rollback works correctly
4. Document any issues found
5. Update procedures if needed

This ensures team knows how to rollback under pressure.

## Emergency Contacts

**On-call rotation** (if applicable):
- Primary: _______________
- Secondary: _______________

**Escalation**:
- If rollback doesn't resolve: _______________
- For data corruption: _______________
- For security issues: _______________

**External contacts**:
- Cloudflare Support: https://dash.cloudflare.com/support
- Stripe Support: https://support.stripe.com/
- Clerk Support: https://clerk.com/support

## Rollback Checklist

When performing rollback:

- [ ] Assess severity and impact
- [ ] Notify team (Slack/Discord)
- [ ] Create incident doc
- [ ] Identify last good deployment
- [ ] Perform rollback (worker/pages)
- [ ] Verify health endpoint
- [ ] Run smoke tests
- [ ] Check error rate normalized
- [ ] Test critical flows manually
- [ ] Monitor for 15 minutes
- [ ] Update incident doc with resolution
- [ ] Notify team of resolution
- [ ] Schedule post-mortem

## Common Rollback Scenarios

### Scenario 1: Bad Migration

**Symptoms**: Database errors, 500 responses

**Resolution**:
1. Rollback worker deployment
2. Create reverse migration
3. Test reverse migration locally
4. Apply reverse migration to production
5. Verify database schema

### Scenario 2: Breaking API Change

**Symptoms**: Storefront errors, 400/500 responses

**Resolution**:
1. Rollback API worker
2. If storefront also updated, rollback Pages
3. Verify compatibility
4. Fix API changes, redeploy with backwards compatibility

### Scenario 3: Secret Misconfiguration

**Symptoms**: Auth failures, Stripe errors

**Resolution**:
1. Check secret values via error messages
2. Update secrets: `wrangler secret put`
3. No rollback needed if only secrets changed
4. Verify after secret update

### Scenario 4: CORS Issues

**Symptoms**: Browser console errors, failed requests

**Resolution**:
1. Check `getAllowedOrigins()` in index.ts
2. Rollback worker if CORS config broken
3. Or hotfix: update CORS config and redeploy

## Lessons from Production Incidents

(To be filled in as incidents occur)

### Incident 2026-01-XX: [Title]
- **Root cause**:
- **Impact**:
- **Resolution**:
- **Prevention**:
