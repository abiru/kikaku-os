# Post-Deployment Verification Checklist

Complete this checklist after each production deployment.

## Pre-Flight Checks (Before Deployment)

- [ ] All GitHub Secrets configured
- [ ] Production D1 database created and migrations applied
- [ ] Production R2 bucket created
- [ ] `wrangler.toml` updated with production database_id
- [ ] `DEV_MODE` set to `"false"` in wrangler.toml
- [ ] Stripe Live mode keys configured (not test keys)
- [ ] Clerk production instance configured

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
- [ ] Returns HTTP 200
- [ ] `database` is `"ok"`
- [ ] `r2` is `"ok"`
- [ ] `environment` is `"production"`

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

- [ ] Returns HTTP 200
- [ ] Message is correct

### 3. Storefront Loading

```bash
STOREFRONT_URL="https://www.your-domain.com"  # Or .pages.dev
curl -s "$STOREFRONT_URL/" | grep -q "Led Kikaku"
echo $?  # Should be 0
```

**Browser check**:
- [ ] Storefront loads without errors
- [ ] No console errors (F12 → Console)
- [ ] Images load correctly
- [ ] CSS/styling applied

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

- [ ] Returns HTTP 200
- [ ] Products array present
- [ ] Product data looks correct

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

- [ ] Unauthenticated request returns 401
- [ ] Authenticated request returns 200
- [ ] Admin endpoints protected

### 6. CORS Configuration

Test from browser console on storefront:

```javascript
fetch('https://api.your-domain.com/store/products')
  .then(r => r.json())
  .then(console.log)
```

- [ ] No CORS errors in console
- [ ] Request completes successfully

### 7. Stripe Checkout Flow

Complete test purchase:

1. Visit storefront: `https://www.your-domain.com/store`
2. Add product to cart
3. Proceed to checkout
4. Use Stripe test card: `4242 4242 4242 4242`
5. Complete purchase

**Checklist**:
- [ ] Checkout page loads
- [ ] Stripe Elements rendered
- [ ] Payment processes successfully
- [ ] Order confirmation shown
- [ ] Order appears in admin dashboard
- [ ] Payment record created

**Stripe Dashboard verification**:
- [ ] Payment appears in Stripe Dashboard → Payments
- [ ] Webhook delivered successfully (Developers → Webhooks)
- [ ] Event status: `succeeded`

### 8. Stripe Webhooks

Check webhook delivery:

1. Stripe Dashboard → Developers → Webhooks → [your endpoint]
2. Check "Recent deliveries"

**Checklist**:
- [ ] Webhook endpoint shows as "Active"
- [ ] Recent events delivered successfully (200 OK)
- [ ] No signature verification errors
- [ ] Events processed correctly

**Test webhook**:
```bash
stripe trigger payment_intent.succeeded \
  --webhook-endpoint https://api.your-domain.com/webhooks/stripe
```

- [ ] Test event delivered
- [ ] Returned HTTP 200

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
- [ ] Cron job executes without errors
- [ ] Daily close artifacts created in R2
- [ ] Ledger entries created
- [ ] Check admin dashboard → Reports

**Wait for scheduled run** (next day at 16:00 UTC):
- [ ] Cron runs automatically
- [ ] No errors in logs
- [ ] Artifacts generated

### 10. Clerk Authentication

Test admin dashboard access:

1. Visit: `https://www.your-domain.com/admin`
2. Click "Sign In"
3. Authenticate via Clerk

**Checklist**:
- [ ] Clerk sign-in modal appears
- [ ] Can authenticate successfully
- [ ] Redirected to admin dashboard
- [ ] API calls include auth header
- [ ] Protected routes work

### 11. Error Tracking & Logging

**Cloudflare Logs**:
```bash
wrangler tail kikaku-os-api --format pretty
```

Generate some traffic and check:
- [ ] Requests logged (production mode)
- [ ] No unexpected errors
- [ ] Response times reasonable

**Slack Alerts** (if configured):
Test alert by triggering a daily close failure (or create test endpoint).

- [ ] Alerts delivered to Slack channel
- [ ] Alert format correct
- [ ] Contains useful context

### 12. Database Connectivity

Check database tables:

```bash
wrangler d1 execute ledkikaku-os --remote \
  --command "SELECT COUNT(*) as count FROM products"
```

- [ ] Query executes successfully
- [ ] Data present
- [ ] No connection errors

### 13. R2 Storage

Check artifacts:

```bash
wrangler r2 object list ledkikaku-artifacts --limit 10
```

- [ ] Bucket accessible
- [ ] Can list objects
- [ ] Product images accessible via `/r2?key=...`

### 14. Smoke Tests Script

Run automated smoke tests:

```bash
cd /home/abiru/Code/kikaku-os
export API_URL="https://api.your-domain.com"
export STOREFRONT_URL="https://www.your-domain.com"
./scripts/smoke-test-prod.sh
```

- [ ] All tests pass
- [ ] No errors

### 15. Performance Check

Check response times:

```bash
time curl -s "$API_URL/health" > /dev/null
```

- [ ] Health check: < 200ms
- [ ] Store products: < 500ms
- [ ] Storefront page load: < 2s

**Cloudflare Analytics**:
1. Dashboard → Workers & Pages → kikaku-os-api → Analytics
2. Check metrics:
   - [ ] Request success rate > 99%
   - [ ] Avg CPU time < 50ms
   - [ ] No errors

## 24-Hour Monitoring Period

After deployment, monitor for 24 hours:

**Check every 2-4 hours**:
- [ ] No critical errors in logs
- [ ] Health endpoint returns OK
- [ ] Cron job runs successfully (next occurrence)
- [ ] No alerts triggered

**Metrics to watch**:
- Request volume
- Error rate (should be < 1%)
- Response times
- Database query performance

## Rollback Criteria

Rollback immediately if:
- ❌ Error rate > 5%
- ❌ Health check failing
- ❌ Database connectivity lost
- ❌ Critical functionality broken (checkout, payments)
- ❌ Data corruption detected

See `ROLLBACK_PROCEDURES.md` for rollback steps.

## Sign-Off

Deployment considered successful when:

- ✅ All items in this checklist completed
- ✅ No critical issues during 24-hour monitoring
- ✅ Smoke tests passing
- ✅ Real transactions processed successfully
- ✅ Cron jobs running as scheduled
- ✅ Monitoring shows green across all metrics

**Deployed by**: _______________
**Date**: _______________
**Git commit**: _______________
**Issues found**: _______________
**Resolution**: _______________
