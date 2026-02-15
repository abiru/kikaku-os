# Production Configuration Checklist

Pre-deployment verification checklist for Kikaku OS.
Run `./scripts/verify-prod-config.sh` for automated checks.

## 1. wrangler.toml

### [vars] section

| Variable | Production Value | Dev Value | Notes |
|----------|-----------------|-----------|-------|
| `DEV_MODE` | `"false"` | `"true"` | Enables `/dev/seed` if true |
| `STOREFRONT_BASE_URL` | `https://your-domain.com` | `http://localhost:4321` | Used for CORS origin |
| `SHIPPING_FEE_AMOUNT` | `"500"` | `"500"` | Shipping fee in JPY |
| `FREE_SHIPPING_THRESHOLD` | `"5000"` | `"5000"` | Free shipping threshold in JPY |
| `COMPANY_NAME` | Your company name | - | Shown on receipts |
| `COMPANY_EMAIL` | Your contact email | - | Shown on receipts |

### D1 Database

- [ ] `database_id` is the **production** database ID (from `wrangler d1 create`)
- [ ] `database_name` matches the created database
- [ ] Migrations applied: `wrangler d1 migrations apply ledkikaku-os --remote`

### R2 Bucket

- [ ] `bucket_name` matches the created bucket (`ledkikaku-artifacts`)

### Observability

- [ ] `[observability] enabled = true`

### Cron

- [ ] `triggers.crons` is configured for daily close (`"0 16 * * *"` = 01:00 JST)

## 2. Wrangler Secrets

Set via `wrangler secret put <NAME>` or GitHub Actions deployment.

### Required

| Secret | Format | How to Get |
|--------|--------|-----------|
| `ADMIN_API_KEY` | Random string | `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe Dashboard > API Keys |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe Dashboard > API Keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe Dashboard > Webhooks |
| `CLERK_SECRET_KEY` | `sk_live_...` | Clerk Dashboard > API Keys |

### Optional

| Secret | Purpose |
|--------|---------|
| `CLAUDE_API_KEY` | AI features (content generation, triage) |
| `AI_GATEWAY_ACCOUNT_ID` | Cloudflare AI Gateway proxy |
| `AI_GATEWAY_ID` | Cloudflare AI Gateway proxy |
| `SLACK_WEBHOOK_URL` | Alert notifications |
| `RESEND_API_KEY` | Email notifications |
| `SENTRY_DSN` | Error tracking |

### Verification

```bash
wrangler secret list
```

## 3. GitHub Actions Secrets

Set in: GitHub repo > Settings > Secrets and variables > Actions

### Required for deployment

| Secret | Priority |
|--------|----------|
| `CLOUDFLARE_API_TOKEN` | CRITICAL |
| `CLOUDFLARE_ACCOUNT_ID` | CRITICAL |
| `ADMIN_API_KEY` | CRITICAL |
| `STRIPE_SECRET_KEY` | CRITICAL |
| `STRIPE_PUBLISHABLE_KEY` | HIGH |
| `STRIPE_WEBHOOK_SECRET` | HIGH |
| `CLERK_SECRET_KEY` | CRITICAL |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | HIGH |

### Optional

| Secret | Purpose |
|--------|---------|
| `SLACK_WEBHOOK_URL` | Deployment alerts |
| `RESEND_API_KEY` | Email notifications |

### Repository Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PROD_API_BASE_URL` | API URL override | `https://api.your-domain.com` |
| `PROD_STOREFRONT_URL` | Storefront URL override | `https://www.your-domain.com` |

## 4. Storefront Environment

Set during build in `deploy.yml` or via Cloudflare Pages environment variables.

| Variable | Production Value |
|----------|-----------------|
| `PUBLIC_API_BASE` | `https://api.your-domain.com` (not localhost) |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` (not `pk_test_...`) |
| `CLERK_SECRET_KEY` | `sk_live_...` (not `sk_test_...`) |

## 5. Key Safety Checks

- [ ] **No test keys in production**: `sk_test_`, `pk_test_`, `sk_test_` prefixes must NOT appear
- [ ] **No localhost URLs**: `STOREFRONT_BASE_URL` and `PUBLIC_API_BASE` must not contain `localhost` or `127.0.0.1`
- [ ] **DEV_MODE = false**: The `/dev/seed` endpoint must be disabled
- [ ] **Secrets not in [vars]**: API keys must use `wrangler secret put`, not plaintext in `wrangler.toml`
- [ ] **Stripe live mode**: Both `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` use `sk_live_`/`pk_live_` prefixes
- [ ] **Clerk production instance**: Both `CLERK_SECRET_KEY` and `PUBLIC_CLERK_PUBLISHABLE_KEY` use `sk_live_`/`pk_live_` prefixes

## 6. Post-Deployment Verification

After deploying, run the smoke test:

```bash
export API_URL="https://your-api-domain.com"
export STOREFRONT_URL="https://your-storefront-domain.com"
./scripts/smoke-test-prod.sh
```

See also: [Verification Checklist](./VERIFICATION_CHECKLIST.md)
