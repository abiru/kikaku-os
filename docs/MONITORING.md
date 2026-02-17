# Monitoring & Alerting Guide

## Overview

Led Kikaku OS uses a three-layer monitoring stack:

1. **Cloudflare Observability** (built-in) — request metrics, error rates, latency
2. **Sentry** (error tracking) — exception capture, performance monitoring, cron monitoring
3. **Slack** (alerts) — critical/warning notifications for ops team

## Setup

### 1. Sentry

**Required secret**: `SENTRY_DSN`

```bash
# Set via Cloudflare dashboard or wrangler
wrangler secret put SENTRY_DSN
# Paste your Sentry DSN (e.g., https://xxx@o123.ingest.sentry.io/456)
```

**Configuration** (`apps/api/src/lib/sentry.ts`):
- Error sample rate: 100% (all errors captured)
- Transaction sample rate: 10% in production, 100% in dev
- 4xx errors are filtered out (expected client errors)
- Release tracked via `CF_VERSION_METADATA`

**Cron Monitors**:
- `daily-close` — daily close report generation (16:00 UTC / 01:00 JST)
- `anomaly-checks` — anomaly detection rules

### 2. Slack Notifications

**Required secret**: `SLACK_WEBHOOK_URL`

```bash
wrangler secret put SLACK_WEBHOOK_URL
# Paste your Slack Incoming Webhook URL
```

**Alert levels**:
| Level | Emoji | Triggers |
|-------|-------|----------|
| `critical` | :rotating_light: | Daily close failure, DB errors, payment failures |
| `warning` | :warning: | Inventory low stock, anomaly detected |
| `info` | :information_source: | Routine notifications |

### 3. Cloudflare Observability

Enabled in `wrangler.toml`:
```toml
[observability]
enabled = true
```

Access via Cloudflare Dashboard > Workers & Pages > [worker] > Logs & Analytics.

## Alert Rules

### Critical (immediate response required)

| Alert | Source | Action |
|-------|--------|--------|
| Database unavailable | Global error handler (503 DB_UNAVAILABLE) | Check D1 status, contact Cloudflare support |
| Daily close failed | Cron scheduled task | Manual re-run via `/dev/daily-close` (DEV_MODE) or re-trigger cron |
| Stripe circuit breaker open | `payments.ts` circuit breaker | Check Stripe status page, wait for auto-recovery |
| Payment webhook failures | Sentry exception tracking | Verify webhook secret, check Stripe dashboard |

### Warning (investigate within 1 hour)

| Alert | Source | Action |
|-------|--------|--------|
| ADMIN_API_KEY weak/short | Health check endpoint | Rotate key to 32+ char random string |
| DEV_MODE enabled in production | Health check endpoint | Set DEV_MODE=false in production |
| Inventory low stock | Inventory alert cron | Review stock levels, reorder if needed |

## Health Check Endpoint

```bash
# Public (returns 200 or 503)
curl https://api.example.com/health

# Authenticated (returns full diagnostics)
curl -H "x-admin-key: $ADMIN_API_KEY" https://api.example.com/health

# Detailed (secrets + security status)
curl -H "x-admin-key: $ADMIN_API_KEY" "https://api.example.com/health?detailed=true"
```

**Recommended**: Set up an external uptime monitor (e.g., Cloudflare Health Checks, UptimeRobot) to poll `/health` every 60 seconds.

## Escalation Procedure

1. **Auto-alert** — Sentry captures error, Slack notification sent
2. **Triage** (0-15 min) — Check Sentry for error details and frequency
3. **Investigate** (15-30 min) — Use `wrangler tail` for real-time logs, check Cloudflare dashboard
4. **Mitigate** — If DB issue: wait for D1 recovery. If Stripe: check status.stripe.com
5. **Resolve** — Deploy fix via PR, verify health check returns 200
6. **Post-mortem** — Document in GitHub Issue, update runbook if needed

## Dashboard Links

- Cloudflare Workers: `https://dash.cloudflare.com/` > Workers & Pages
- Sentry: `https://sentry.io/` > led-kikaku-os project
- Stripe Dashboard: `https://dashboard.stripe.com/`
