# Production Deployment Guide

Complete guide for deploying Kikaku OS to production on Cloudflare.

## Overview

**Stack**:
- API: Hono on Cloudflare Workers
- Storefront: Astro SSR on Cloudflare Pages
- Database: Cloudflare D1 (SQLite)
- Storage: Cloudflare R2
- Auth: Clerk
- Payments: Stripe

**Deployment Strategy**: Phased rollout with validation at each step

**Estimated Timeline**: 3-4 weeks

**Cost Estimate**: $0-10/month (can start on free tier)

## Prerequisites

Before starting deployment:

- [ ] Cloudflare account with Workers/Pages enabled
- [ ] Domain registered and managed in Cloudflare (optional but recommended)
- [ ] Stripe account fully verified (Live mode enabled)
- [ ] Clerk account with production instance
- [ ] GitHub repository access
- [ ] Local development environment working
- [ ] All tests passing locally: `pnpm -C apps/api test`

## Quick Start (for the impatient)

```bash
# 1. Create infrastructure
wrangler d1 create ledkikaku-os
wrangler r2 bucket create ledkikaku-artifacts

# 2. Apply migrations
wrangler d1 migrations apply ledkikaku-os --remote

# 3. Update wrangler.toml with database_id

# 4. Configure GitHub Secrets (see docs/GITHUB_SECRETS.md)

# 5. Deploy
git push origin main  # Triggers deployment workflow

# 6. Verify
./scripts/smoke-test-prod.sh
```

For detailed step-by-step instructions, continue reading.

## Phase 1: Infrastructure Setup

**Goal**: Create production Cloudflare resources

### 1.1 Create D1 Database

```bash
cd /home/abiru/Code/kikaku-os
wrangler d1 create ledkikaku-os
```

**Output**:
```
✅ Successfully created DB 'ledkikaku-os'

[[d1_databases]]
binding = "DB"
database_name = "ledkikaku-os"
database_id = "abc123-def456-ghi789"  ← COPY THIS
```

**Action**: Copy the `database_id` value.

### 1.2 Create R2 Bucket

```bash
wrangler r2 bucket create ledkikaku-artifacts
```

**Output**:
```
✅ Created bucket 'ledkikaku-artifacts'
```

### 1.3 Apply Database Migrations

Apply all 28 migrations to production database:

```bash
wrangler d1 migrations apply ledkikaku-os --remote
```

**Verify schema**:
```bash
wrangler d1 execute ledkikaku-os --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected: ~25 tables including customers, products, orders, payments, etc.

### 1.4 Update wrangler.toml

**File**: `wrangler.toml` (line 10)

**Before**:
```toml
database_id = "DUMMY_REPLACE"
```

**After**:
```toml
database_id = "abc123-def456-ghi789"  # Your actual ID
```

Also update these values:
- Line 17: `DEV_MODE = "false"` (already done)
- Line 18: `STOREFRONT_BASE_URL` - update after custom domain setup
- Line 28: `STRIPE_PUBLISHABLE_KEY` - update with production key

**Commit changes**:
```bash
git add wrangler.toml
git commit -m "chore: configure production database"
```

### 1.5 Configure GitHub Secrets

See `docs/GITHUB_SECRETS.md` for detailed instructions.

**Required secrets** (navigate to: GitHub repo → Settings → Secrets and variables → Actions):

| Secret | How to Get | Priority |
|--------|-----------|----------|
| `CLOUDFLARE_API_TOKEN` | Dashboard → My Profile → API Tokens | CRITICAL |
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard → Workers & Pages → Account ID | CRITICAL |
| `ADMIN_API_KEY` | Generate: `openssl rand -base64 32` | CRITICAL |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys (sk_live_...) | CRITICAL |
| `STRIPE_WEBHOOK_SECRET` | Created after first deployment | HIGH |
| `CLERK_SECRET_KEY` | Clerk → API Keys (sk_live_...) | CRITICAL |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys (pk_live_...) | HIGH |

**Optional** (monitoring):
- `SLACK_WEBHOOK_URL` - For alerts
- `RESEND_API_KEY` - For email notifications
- `SENTRY_DSN` - For error tracking

**Verification**: After adding, verify all secrets appear in Settings → Secrets.

## Phase 2: Code Changes (Already Completed)

The following changes have been implemented:

- ✅ Health check endpoint: `/health`
- ✅ Production logging middleware
- ✅ CORS dynamic origin support
- ✅ Slack alert system
- ✅ Error tracking (Sentry-ready)
- ✅ Observability enabled in wrangler.toml

No additional code changes needed.

## Phase 3: First Deployment

### 3.1 Deploy via GitHub Actions

**Automatic deployment** (on push to main):

```bash
git push origin main
```

**Manual deployment**:

1. Go to GitHub → Actions
2. Select "Deploy to Production" workflow
3. Click "Run workflow" → "Run workflow"
4. Monitor deployment progress

**Expected workflow**:
1. ✅ Type check (API + Storefront)
2. ✅ Test API
3. ✅ Build API
4. ✅ Build Storefront
5. ✅ Deploy API to Workers
6. ✅ Configure secrets
7. ✅ Deploy Storefront to Pages
8. ✅ Smoke tests

**Time**: ~5-8 minutes

### 3.2 Get Deployment URLs

After deployment completes:

**API URL**: Check GitHub Actions logs or:
```bash
wrangler deployments list --name kikaku-os-api
```

Default: `https://kikaku-os-api.workers.dev`

**Storefront URL**: Check Cloudflare Dashboard → Pages → kikaku-storefront

Default: `https://kikaku-storefront.pages.dev`

### 3.3 Configure Stripe Webhook

**Now that API is deployed**, configure Stripe webhook.

See `docs/STRIPE_WEBHOOK_SETUP.md` for detailed instructions.

**Quick steps**:

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://kikaku-os-api.workers.dev/webhooks/stripe` (or your custom domain)
3. Events: Select payment_intent, charge, checkout, customer events
4. Copy webhook secret (whsec_...)
5. Add to GitHub Secrets: `STRIPE_WEBHOOK_SECRET`
6. Redeploy: `git push origin main` or update secret:

```bash
echo "whsec_..." | wrangler secret put STRIPE_WEBHOOK_SECRET
```

**Test webhook**:
```bash
stripe trigger payment_intent.succeeded \
  --webhook-endpoint https://kikaku-os-api.workers.dev/webhooks/stripe
```

## Phase 4: Custom Domain Setup (Optional)

See `docs/CUSTOM_DOMAIN_SETUP.md` for detailed instructions.

### 4.1 API Custom Domain

**Cloudflare Dashboard**:
1. Workers & Pages → kikaku-os-api → Triggers
2. Custom Domains → Add Custom Domain
3. Enter: `api.your-domain.com`

DNS and SSL configured automatically.

### 4.2 Storefront Custom Domain

**Cloudflare Dashboard**:
1. Pages → kikaku-storefront → Custom domains
2. Set up a custom domain
3. Enter: `www.your-domain.com`

### 4.3 Update Configuration

After domains are active:

**wrangler.toml**:
```toml
STOREFRONT_BASE_URL = "https://www.your-domain.com"
```

**.github/workflows/deploy.yml**:
Update all URLs from `.workers.dev` / `.pages.dev` to your domains.

**Stripe webhook**:
Update endpoint URL to custom domain.

**Redeploy**:
```bash
git add wrangler.toml .github/workflows/deploy.yml
git commit -m "feat: configure custom domains"
git push origin main
```

## Phase 5: Monitoring & Alerts

### 5.1 Cloudflare Analytics

**Enable** (already configured in wrangler.toml):
```toml
[observability]
enabled = true
```

**View metrics**:
Dashboard → Workers & Pages → kikaku-os-api → Analytics

**Monitor**:
- Request volume
- Error rate (should be < 1%)
- CPU time
- Success rate (should be > 99%)

### 5.2 Slack Alerts

**Configure** (if not done):
1. Create Slack incoming webhook
2. Add to GitHub Secrets: `SLACK_WEBHOOK_URL`
3. Redeploy

**Test alert** (create test endpoint or wait for daily close):
Alerts trigger on:
- Daily close failures
- Critical errors
- Anomaly detection

### 5.3 Real-time Logs

**Stream logs**:
```bash
wrangler tail kikaku-os-api --format pretty
```

**Structured logs** in production (JSON format).

### 5.4 Database Backups

**Run backup script** (weekly recommended):

```bash
./scripts/backup-db.sh
```

**Schedule via cron** (on local machine or CI):
```bash
# Add to crontab
0 2 * * 0 cd /path/to/kikaku-os && ./scripts/backup-db.sh
```

Or create GitHub Actions workflow for weekly backups.

## Phase 6: Verification

See `docs/VERIFICATION_CHECKLIST.md` for complete checklist.

### Quick Verification

**Run smoke tests**:
```bash
export API_URL="https://your-api-domain.com"
export STOREFRONT_URL="https://your-storefront-domain.com"
./scripts/smoke-test-prod.sh
```

**Manual checks**:

1. **Health**: `curl https://api.your-domain.com/health | jq`
2. **Storefront**: Visit in browser, check for errors
3. **Checkout flow**: Complete test purchase
4. **Stripe webhook**: Check Dashboard → Webhooks
5. **Admin dashboard**: Login and verify access
6. **Daily close**: Wait for cron or trigger manually

### 24-Hour Monitoring

After deployment:
- Monitor error rates
- Check request volumes
- Verify cron jobs run successfully
- Ensure no alerts triggered

**Success criteria**:
- ✅ Health check returns OK
- ✅ Complete checkout flow works
- ✅ Stripe webhooks delivered successfully
- ✅ Daily close cron runs successfully
- ✅ Error rate < 1%
- ✅ No critical issues for 24 hours

## Rollback Procedures

See `docs/ROLLBACK_PROCEDURES.md` for detailed procedures.

**Quick rollback**:

```bash
# List deployments
wrangler deployments list --name kikaku-os-api

# Rollback to previous
wrangler rollback --name kikaku-os-api --deployment-id <PREVIOUS_ID>
```

**When to rollback**:
- Error rate > 5%
- Health check failing
- Critical functionality broken
- Data corruption

## Troubleshooting

### Deployment fails with "Invalid API token"

**Fix**: Verify `CLOUDFLARE_API_TOKEN` has correct permissions.

Create new token with "Edit Cloudflare Workers" template.

### Health check returns "database: error"

**Check**:
1. Database ID in wrangler.toml is correct
2. Migrations applied: `wrangler d1 migrations apply ledkikaku-os --remote`
3. Database exists: `wrangler d1 list`

### CORS errors in browser console

**Check**:
1. `STOREFRONT_BASE_URL` in wrangler.toml matches actual domain
2. CORS middleware includes production domain
3. Redeploy after updating configuration

### Stripe webhooks failing

**Check**:
1. Webhook URL is correct (includes `/webhooks/stripe`)
2. Webhook secret matches Stripe Dashboard
3. Endpoint is not protected by auth (should bypass Clerk)
4. API is deployed and accessible

### Clerk auth not working

**Check**:
1. `CLERK_SECRET_KEY` is for production instance
2. `PUBLIC_CLERK_PUBLISHABLE_KEY` matches secret key environment
3. Both keys from same Clerk instance
4. Allowed origins in Clerk Dashboard include production domains

## Cost Breakdown

**Cloudflare Workers** (API):
- Free: 100,000 requests/day
- Paid ($5/month): 10M requests/month

**Cloudflare D1** (Database):
- Free: 5GB storage, 5M reads/day, 100K writes/day
- Paid ($0.75/month base): Higher limits

**Cloudflare R2** (Storage):
- Free: 10GB storage, 1M Class A ops, 10M Class B ops
- No egress fees

**Cloudflare Pages** (Storefront):
- Free: 500 builds/month, unlimited requests
- Paid ($20/month): 5,000 builds/month

**Total**: $0-10/month for moderate traffic

## Next Steps

After successful deployment:

1. **Monitor for 1 week** - Watch metrics, error rates
2. **Test all features** - Comprehensive testing in production
3. **Document issues** - Track any bugs or issues found
4. **Plan improvements** - Based on production usage
5. **Set up staging** - Create staging environment for safer testing
6. **Regular backups** - Schedule weekly database backups
7. **Update documentation** - Document any deviations or learnings

## Support

**Documentation**:
- `docs/GITHUB_SECRETS.md` - Secrets configuration
- `docs/STRIPE_WEBHOOK_SETUP.md` - Stripe webhook setup
- `docs/CUSTOM_DOMAIN_SETUP.md` - Custom domains
- `docs/VERIFICATION_CHECKLIST.md` - Post-deployment verification
- `docs/ROLLBACK_PROCEDURES.md` - Emergency rollback

**Cloudflare Resources**:
- Dashboard: https://dash.cloudflare.com
- Docs: https://developers.cloudflare.com/workers/
- Support: https://dash.cloudflare.com/support

**External Services**:
- Stripe Dashboard: https://dashboard.stripe.com
- Clerk Dashboard: https://dashboard.clerk.com
- GitHub Actions: https://github.com/[your-repo]/actions

## Deployment History

(Track deployments here)

| Date | Commit | Deployed By | Status | Notes |
|------|--------|-------------|--------|-------|
| YYYY-MM-DD | abc123 | Name | ✅ Success | Initial deployment |
| | | | | |
