# Post-Deployment Verification Checklist

Complete this checklist after each production deployment.

> Items marked **[AUTO]** are verified by `scripts/smoke-test-prod.sh` (runs in CI).
> Items marked **[MANUAL]** require human verification.

## Pre-Flight Checks (Before Deployment)

- [ ] **[MANUAL]** All GitHub Secrets configured
- [ ] **[MANUAL]** Production D1 database created and migrations applied
- [ ] **[MANUAL]** Production R2 bucket created
- [ ] **[MANUAL]** `wrangler.toml` updated with production database_id
- [ ] **[MANUAL]** `DEV_MODE` set to `"false"` in wrangler.toml
- [ ] **[MANUAL]** Stripe Live mode keys configured (not test keys)
- [ ] **[MANUAL]** Clerk production instance configured

## Deployment Verification

### 1. API Health Check

```bash
API_URL="https://api.your-domain.com"  # Or .workers.dev
curl -s "$API_URL/health" | jq
```

**Expected**:
```json
{
  "ok": true,
  "api": "ok",
  "database": "ok",
  "r2": "ok",
  "timestamp": "2026-01-28T...",
  "environment": "production"
}
```

**Checklist**:
- [ ] **[AUTO]** Returns HTTP 200
- [ ] **[AUTO]** `database` is `"ok"`
- [ ] **[AUTO]** `r2` is `"ok"`
- [ ] **[AUTO]** `secrets` is `"ok"`
- [ ] **[MANUAL]** `environment` is `"production"`

### 2. API Root Endpoint

```bash
curl -s "$API_URL/" | jq
```

**Expected**:
```json
{
  "ok": true,
  "message": "led kikaku os api"
}
```

- [ ] **[AUTO]** Returns HTTP 200
- [ ] **[AUTO]** Message is correct

### 3. Storefront Loading

```bash
STOREFRONT_URL="https://www.your-domain.com"  # Or .pages.dev
curl -s "$STOREFRONT_URL/" | grep -q "Led Kikaku"
echo $?  # Should be 0
```

**Browser check**:
- [ ] **[AUTO]** Storefront loads (contains "Led Kikaku")
- [ ] **[MANUAL]** No console errors (F12 → Console)
- [ ] **[MANUAL]** Images load correctly
- [ ] **[MANUAL]** CSS/styling applied

### 4. Store Products Endpoint

```bash
curl -s "$API_URL/store/products" | jq
```

**Expected**:
```json
{
  "ok": true,
  "products": [...],
  "pagination": {...}
}
```

- [ ] **[AUTO]** Returns HTTP 200
- [ ] **[AUTO]** Products array present
- [ ] **[AUTO]** Pagination present
- [ ] **[MANUAL]** Product data looks correct

### 5. Authentication Protection

```bash
# Should return 401 Unauthorized
curl -i "$API_URL/admin/products"
```

**Expected**: HTTP 401

**With auth**:
```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" "$API_URL/admin/products"
```

**Expected**: HTTP 200

- [ ] **[AUTO]** Admin products returns 401 without auth
- [ ] **[AUTO]** Inbox returns 401 without auth
- [ ] **[AUTO]** Reports returns 401 without auth
- [ ] **[AUTO]** Inventory returns 401 without auth
- [ ] **[MANUAL]** Authenticated request returns 200

### 6. CORS Configuration

Test from browser console on storefront:

```javascript
fetch('https://api.your-domain.com/store/products')
  .then(r => r.json())
  .then(console.log)
```

- [ ] **[MANUAL]** No CORS errors in console
- [ ] **[MANUAL]** Request completes successfully

### 7. Stripe Checkout Flow

Complete test purchase:

1. Visit storefront: `https://www.your-domain.com/store`
2. Add product to cart
3. Proceed to checkout
4. Use Stripe test card: `4242 4242 4242 4242`
5. Complete purchase

**Endpoint checks**:
- [ ] **[AUTO]** Checkout session endpoint rejects empty body (not 500)
- [ ] **[AUTO]** Payment create-intent endpoint rejects empty body (not 500)

**Full flow (manual)**:
- [ ] **[MANUAL]** Checkout page loads
- [ ] **[MANUAL]** Stripe Elements rendered
- [ ] **[MANUAL]** Payment processes successfully
- [ ] **[MANUAL]** Order confirmation shown
- [ ] **[MANUAL]** Order appears in admin dashboard
- [ ] **[MANUAL]** Payment record created

**Stripe Dashboard verification**:
- [ ] **[MANUAL]** Payment appears in Stripe Dashboard → Payments
- [ ] **[MANUAL]** Webhook delivered successfully (Developers → Webhooks)
- [ ] **[MANUAL]** Event status: `succeeded`

### 8. Stripe Webhooks

Check webhook delivery:

1. Stripe Dashboard → Developers → Webhooks → [your endpoint]
2. Check "Recent deliveries"

**Checklist**:
- [ ] **[AUTO]** Webhook endpoint rejects unsigned request (not 500)
- [ ] **[MANUAL]** Webhook endpoint shows as "Active" in Stripe Dashboard
- [ ] **[MANUAL]** Recent events delivered successfully (200 OK)
- [ ] **[MANUAL]** No signature verification errors
- [ ] **[MANUAL]** Events processed correctly

**Test webhook**:
```bash
stripe trigger payment_intent.succeeded \
  --webhook-endpoint https://api.your-domain.com/webhooks/stripe
```

- [ ] **[MANUAL]** Test event delivered
- [ ] **[MANUAL]** Returned HTTP 200

### 9. Daily Close Cron Job

**Manual trigger** (via Cloudflare Dashboard):
1. Workers & Pages → kikaku-os-api
2. Settings → Triggers → Cron Triggers
3. Click "Test" next to `0 16 * * *`

Or via API:
```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/kikaku-os-api/schedules/trigger" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

**Verification**:
- [ ] **[AUTO]** Scheduled handler endpoint accessible (not 500)
- [ ] **[MANUAL]** Cron job executes without errors
- [ ] **[MANUAL]** Daily close artifacts created in R2
- [ ] **[MANUAL]** Ledger entries created
- [ ] **[MANUAL]** Check admin dashboard → Reports

**Wait for scheduled run** (next day at 16:00 UTC):
- [ ] **[MANUAL]** Cron runs automatically
- [ ] **[MANUAL]** No errors in logs
- [ ] **[MANUAL]** Artifacts generated

### 10. Clerk Authentication

Test admin dashboard access:

1. Visit: `https://www.your-domain.com/admin`
2. Click "Sign In"
3. Authenticate via Clerk

**Checklist**:
- [ ] **[MANUAL]** Clerk sign-in modal appears
- [ ] **[MANUAL]** Can authenticate successfully
- [ ] **[MANUAL]** Redirected to admin dashboard
- [ ] **[MANUAL]** API calls include auth header
- [ ] **[MANUAL]** Protected routes work

### 11. Error Tracking & Logging

**Cloudflare Logs**:
```bash
wrangler tail kikaku-os-api --format pretty
```

Generate some traffic and check:
- [ ] **[MANUAL]** Requests logged (production mode)
- [ ] **[MANUAL]** No unexpected errors
- [ ] **[MANUAL]** Response times reasonable

**Slack Alerts** (if configured):
Test alert by triggering a daily close failure (or create test endpoint).

- [ ] **[MANUAL]** Alerts delivered to Slack channel
- [ ] **[MANUAL]** Alert format correct
- [ ] **[MANUAL]** Contains useful context

### 12. Database Connectivity

Check database tables:

```bash
wrangler d1 execute ledkikaku-os --remote \
  --command "SELECT COUNT(*) as count FROM products"
```

- [ ] **[AUTO]** Health check confirms database is OK
- [ ] **[MANUAL]** Query executes successfully via wrangler
- [ ] **[MANUAL]** Data present
- [ ] **[MANUAL]** No connection errors

### 13. R2 Storage

Check artifacts:

```bash
wrangler r2 object list ledkikaku-artifacts --limit 10
```

- [ ] **[AUTO]** Health check confirms R2 is OK
- [ ] **[MANUAL]** Can list objects via wrangler
- [ ] **[MANUAL]** Product images accessible via `/r2?key=...`

### 14. Smoke Tests Script

Run automated smoke tests:

```bash
cd /home/abiru/Code/kikaku-os
export API_URL="https://api.your-domain.com"
export STOREFRONT_URL="https://www.your-domain.com"
./scripts/smoke-test-prod.sh
```

- [ ] **[AUTO]** All tests pass (runs in CI after deploy)
- [ ] **[MANUAL]** Run manually after custom domain changes

### 15. Performance Check

Check response times:

```bash
time curl -s "$API_URL/health" > /dev/null
```

- [ ] **[MANUAL]** Health check: < 200ms
- [ ] **[MANUAL]** Store products: < 500ms
- [ ] **[MANUAL]** Storefront page load: < 2s

**Cloudflare Analytics**:
1. Dashboard → Workers & Pages → kikaku-os-api → Analytics
2. Check metrics:
   - [ ] **[MANUAL]** Request success rate > 99%
   - [ ] **[MANUAL]** Avg CPU time < 50ms
   - [ ] **[MANUAL]** No errors

## 24-Hour Monitoring Period

After deployment, monitor for 24 hours:

**Check every 2-4 hours**:
- [ ] **[MANUAL]** No critical errors in logs
- [ ] **[MANUAL]** Health endpoint returns OK
- [ ] **[MANUAL]** Cron job runs successfully (next occurrence)
- [ ] **[MANUAL]** No alerts triggered

**Metrics to watch**:
- Request volume
- Error rate (should be < 1%)
- Response times
- Database query performance

## Rollback Criteria

Rollback immediately if:
- Error rate > 5%
- Health check failing
- Database connectivity lost
- Critical functionality broken (checkout, payments)
- Data corruption detected

See `ROLLBACK_PROCEDURES.md` for rollback steps.

## Sign-Off

Deployment considered successful when:

- All **[AUTO]** items pass in CI
- All **[MANUAL]** items completed by operator
- No critical issues during 24-hour monitoring
- Real transactions processed successfully
- Cron jobs running as scheduled
- Monitoring shows green across all metrics

**Deployed by**: _______________
**Date**: _______________
**Git commit**: _______________
**Issues found**: _______________
**Resolution**: _______________
