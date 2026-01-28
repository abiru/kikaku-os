# Deployment Documentation

Complete production deployment documentation for Kikaku OS.

## Quick Links

- **[Main Deployment Guide](../../DEPLOYMENT.md)** - Step-by-step deployment instructions
- **[GitHub Secrets Setup](../GITHUB_SECRETS.md)** - Configure required secrets
- **[Stripe Webhook Setup](../STRIPE_WEBHOOK_SETUP.md)** - Post-deployment Stripe configuration
- **[Custom Domain Setup](../CUSTOM_DOMAIN_SETUP.md)** - Optional custom domains
- **[Verification Checklist](../VERIFICATION_CHECKLIST.md)** - Post-deployment verification
- **[Rollback Procedures](../ROLLBACK_PROCEDURES.md)** - Emergency rollback guide

## Deployment Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Kikaku OS Production                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │  Cloudflare  │      │  Cloudflare  │                   │
│  │   Workers    │◄────►│    Pages     │                   │
│  │   (API)      │      │ (Storefront) │                   │
│  └──────┬───────┘      └──────────────┘                   │
│         │                                                   │
│         ├─────────►┌──────────────┐                       │
│         │          │ Cloudflare D1│                       │
│         │          │  (Database)  │                       │
│         │          └──────────────┘                       │
│         │                                                   │
│         ├─────────►┌──────────────┐                       │
│         │          │ Cloudflare R2│                       │
│         │          │  (Storage)   │                       │
│         │          └──────────────┘                       │
│         │                                                   │
│         ├─────────►┌──────────────┐                       │
│         │          │    Stripe    │                       │
│         │          │  (Payments)  │                       │
│         │          └──────────────┘                       │
│         │                                                   │
│         └─────────►┌──────────────┐                       │
│                    │     Clerk    │                       │
│                    │    (Auth)    │                       │
│                    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Phases

### Phase 1: Infrastructure Setup ⏱️ Week 1

**Tasks**:
1. Create D1 database: `wrangler d1 create ledkikaku-os`
2. Create R2 bucket: `wrangler r2 bucket create ledkikaku-artifacts`
3. Apply migrations: `wrangler d1 migrations apply ledkikaku-os --remote`
4. Update `wrangler.toml` with database_id
5. Configure GitHub Secrets

**Duration**: 1-2 hours

**Deliverables**:
- ✅ Production D1 database with schema
- ✅ Production R2 bucket
- ✅ GitHub Secrets configured
- ✅ Configuration updated

### Phase 2: Code Changes ⏱️ Week 1-2

**Status**: ✅ **COMPLETED**

All production-ready code changes have been implemented:
- Health check endpoint
- Dynamic CORS support
- Production logging
- Alert system (Slack)
- Error tracking

**No action needed** - code is ready for deployment.

### Phase 3: Deployment Pipeline ⏱️ Week 2

**Tasks**:
1. Deploy via GitHub Actions (automatic on push to main)
2. Configure Stripe webhook (after first deployment)
3. Verify deployment

**Duration**: 30 minutes - 1 hour

**Deliverables**:
- ✅ API deployed to Workers
- ✅ Storefront deployed to Pages
- ✅ Stripe webhook configured
- ✅ Secrets configured in production

### Phase 4: Custom Domains ⏱️ Week 2-3 (Optional)

**Tasks**:
1. Configure API custom domain
2. Configure Storefront custom domain
3. Update configuration files
4. Update Stripe webhook URL
5. Redeploy

**Duration**: 1-2 hours (plus DNS propagation)

**Deliverables**:
- ✅ Custom domains configured
- ✅ SSL certificates active
- ✅ All services updated with new URLs

### Phase 5: Monitoring & Alerts ⏱️ Week 3

**Tasks**:
1. Enable Cloudflare Analytics
2. Configure Slack alerts
3. Set up database backups
4. Test monitoring systems

**Duration**: 2-3 hours

**Deliverables**:
- ✅ Analytics enabled
- ✅ Alerts configured and tested
- ✅ Backup system in place

### Phase 6: Verification ⏱️ Week 3-4

**Tasks**:
1. Run complete verification checklist
2. Test all critical flows
3. Monitor for 24 hours
4. Document any issues

**Duration**: 1 day active testing + 24 hours monitoring

**Deliverables**:
- ✅ All verification checks passed
- ✅ Production ready for traffic
- ✅ Team trained on monitoring

## Implementation Status

**Code Changes**: ✅ Complete
- [x] Health check endpoint (`/health`)
- [x] Production logging middleware
- [x] Dynamic CORS configuration
- [x] Alert system (Slack integration)
- [x] Error tracking (Sentry-ready)
- [x] Observability enabled

**Scripts**: ✅ Complete
- [x] Smoke test script (`scripts/smoke-test-prod.sh`)
- [x] Database backup script (`scripts/backup-db.sh`)

**CI/CD**: ✅ Complete
- [x] Deployment workflow (`.github/workflows/deploy.yml`)
- [x] Automated smoke tests in CI

**Documentation**: ✅ Complete
- [x] Main deployment guide (`DEPLOYMENT.md`)
- [x] GitHub Secrets guide
- [x] Stripe webhook guide
- [x] Custom domain guide
- [x] Verification checklist
- [x] Rollback procedures

**Infrastructure**: ⏸️ Pending
- [ ] Production D1 database (user action required)
- [ ] Production R2 bucket (user action required)
- [ ] GitHub Secrets configured (user action required)

## Getting Started

### For First-Time Deployment

Start with the **[Main Deployment Guide](../../DEPLOYMENT.md)** and follow phases sequentially.

### For Quick Reference

**Check health**:
```bash
curl https://api.your-domain.com/health | jq
```

**Run smoke tests**:
```bash
export API_URL="https://api.your-domain.com"
export STOREFRONT_URL="https://www.your-domain.com"
./scripts/smoke-test-prod.sh
```

**View logs**:
```bash
wrangler tail kikaku-os-api --format pretty
```

**Rollback**:
```bash
wrangler deployments list --name kikaku-os-api
wrangler rollback --name kikaku-os-api --deployment-id <PREVIOUS_ID>
```

## Key Decisions Made

### 1. Cloudflare Stack (Fixed)

**Decision**: Use Cloudflare Workers, D1, R2 exclusively

**Rationale**:
- Integrated ecosystem
- No egress fees (R2)
- Global edge network
- Excellent free tier
- Simplified operations

**Trade-off**: Vendor lock-in (acceptable for this project)

### 2. Dynamic CORS Configuration

**Decision**: Read allowed origins from environment variable

**Rationale**:
- Single source of truth (wrangler.toml)
- No code changes needed for domain updates
- Supports both dev and production

**Implementation**: `getAllowedOrigins()` function in `index.ts`

### 3. Observability Strategy

**Decision**: Structured JSON logs + Cloudflare Analytics + Slack alerts

**Rationale**:
- Cloudflare Analytics: Built-in, no cost
- Structured logs: Machine-readable, searchable
- Slack alerts: Real-time critical notifications
- Sentry: Optional for error tracking

### 4. Deployment Strategy

**Decision**: GitHub Actions for CD, manual infrastructure creation

**Rationale**:
- Infrastructure (D1, R2): Rarely changes, manual OK
- Application code: Automated for fast iteration
- Secrets: GitHub Secrets for security

### 5. Phased Rollout

**Decision**: 6-phase approach over 3-4 weeks

**Rationale**:
- Reduces risk of issues
- Allows testing at each step
- Time for team to learn system
- Can pause if problems found

## Common Patterns

### Health Check Pattern

All services should have a `/health` endpoint returning service status.

**API**: `/health`
```json
{
  "ok": true,
  "database": "ok",
  "r2": "ok",
  "environment": "production"
}
```

### Alert Pattern

Use `sendAlert()` for production notifications:

```typescript
import { sendAlert } from './lib/alerts';

await sendAlert(env, 'critical', 'Daily close failed', {
  date: targetDate,
  error: errorMessage
});
```

Alerts sent to Slack (if configured), skipped in dev mode.

### Error Tracking Pattern

Use `captureException()` for error tracking:

```typescript
import { captureException } from './lib/sentry';

captureException(error, {
  path: c.req.path,
  method: c.req.method,
  env: c.env
});
```

Errors logged in production, skipped in dev mode.

## Security Considerations

### Secrets Management

**Never commit secrets to git**:
- ✅ Use `.dev.vars` for local dev (gitignored)
- ✅ Use GitHub Secrets for CI/CD
- ✅ Use `wrangler secret put` for production
- ❌ Never put secrets in `wrangler.toml`

### Production vs Development

**Use different credentials**:
- Stripe: Test keys (sk_test_...) vs Live keys (sk_live_...)
- Clerk: Development instance vs Production instance
- Admin API key: Different values for dev/prod

### CORS Configuration

**Principle of least privilege**:
- Only allow necessary origins
- Use exact matches (not wildcards in production)
- Verify origin before allowing

### Webhook Security

**Always verify signatures**:
- Stripe webhooks verified via signature
- Never process webhook data without verification
- Endpoint is public but data is verified

## Monitoring Checklist

Daily monitoring tasks:

- [ ] Check error rate (should be < 1%)
- [ ] Verify daily close ran successfully (16:00 UTC)
- [ ] Check for any critical alerts
- [ ] Review Cloudflare Analytics

Weekly monitoring tasks:

- [ ] Review performance trends
- [ ] Check database growth
- [ ] Run backup script
- [ ] Verify Stripe webhook deliveries

Monthly monitoring tasks:

- [ ] Review cost (should be $0-10)
- [ ] Rotate secrets (90-day cycle)
- [ ] Review and archive logs
- [ ] Update dependencies

## Troubleshooting Guide

### Quick Diagnostics

**Issue**: API returning errors

**Check**:
1. Health endpoint: `curl https://api.../health`
2. Recent logs: `wrangler tail kikaku-os-api`
3. Recent deployments: `wrangler deployments list`
4. Cloudflare Analytics: Check error rate

**Issue**: Storefront not loading

**Check**:
1. Cloudflare Pages status
2. Browser console for errors
3. API connectivity (CORS)
4. Custom domain DNS

**Issue**: Payments failing

**Check**:
1. Stripe Dashboard → Events
2. Webhook deliveries
3. STRIPE_SECRET_KEY correct
4. Checkout flow in browser

**Issue**: Auth not working

**Check**:
1. Clerk Dashboard → Logs
2. CLERK_SECRET_KEY correct
3. Allowed origins in Clerk
4. PUBLIC_CLERK_PUBLISHABLE_KEY matches

### Escalation Path

**Level 1**: Self-service (this documentation)

**Level 2**: Team lead / Senior developer

**Level 3**: External support
- Cloudflare Support: https://dash.cloudflare.com/support
- Stripe Support: https://support.stripe.com/
- Clerk Support: https://clerk.com/support

**Critical issues**: Follow rollback procedures immediately

## Success Metrics

**Deployment successful when**:
- ✅ All verification checks passed
- ✅ Error rate < 1% for 24 hours
- ✅ Complete checkout flow works
- ✅ Daily close cron runs successfully
- ✅ All smoke tests passing
- ✅ Team trained and confident

**Production healthy when**:
- Success rate > 99%
- P95 response time < 500ms
- Zero critical alerts
- Daily close runs on schedule
- Database size growing normally
- Cost within budget ($0-10/month)

## Next Steps

After successful deployment:

1. **Week 1**: Monitor actively, address any issues
2. **Week 2**: Test all edge cases in production
3. **Week 3**: Collect user feedback
4. **Week 4**: Plan improvements based on production data

**Long-term**:
- Set up staging environment
- Implement additional monitoring
- Optimize performance based on analytics
- Plan feature roadmap

## Resources

**Documentation**:
- `/DEPLOYMENT.md` - Main deployment guide
- `/docs/GITHUB_SECRETS.md` - Secrets setup
- `/docs/STRIPE_WEBHOOK_SETUP.md` - Stripe configuration
- `/docs/CUSTOM_DOMAIN_SETUP.md` - Domain setup
- `/docs/VERIFICATION_CHECKLIST.md` - Verification
- `/docs/ROLLBACK_PROCEDURES.md` - Rollback

**Scripts**:
- `/scripts/smoke-test-prod.sh` - Smoke tests
- `/scripts/backup-db.sh` - Database backup

**CI/CD**:
- `/.github/workflows/deploy.yml` - Deployment workflow
- `/.github/workflows/ci.yml` - CI pipeline

**External**:
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Stripe API Docs](https://stripe.com/docs/api)
- [Clerk Docs](https://clerk.com/docs)

## Contact

For questions or issues with deployment:

- **Project Lead**: _______________
- **DevOps**: _______________
- **Slack Channel**: _______________
