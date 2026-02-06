# GitHub Secrets Configuration Guide

Configure these secrets in your GitHub repository before deploying to production.

**Path**: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

## Critical Secrets (Required)

### CLOUDFLARE_API_TOKEN
**Priority**: CRITICAL
**Source**: Cloudflare Dashboard → My Profile → API Tokens → Create Token

1. Click "Create Token"
2. Use "Edit Cloudflare Workers" template
3. Permissions needed:
   - Account → Workers Scripts → Edit
   - Account → D1 → Edit
   - Account → R2 → Edit
   - Zone → Workers Routes → Edit (if using custom domains)
4. Copy the token (starts with `...`)

### CLOUDFLARE_ACCOUNT_ID
**Priority**: CRITICAL
**Source**: Cloudflare Dashboard → Workers & Pages → Right sidebar

Copy the Account ID (hexadecimal string like `a1b2c3d4e5f6...`)

### ADMIN_API_KEY
**Priority**: CRITICAL
**Generate**:
```bash
openssl rand -base64 32
```

This is used for authenticating admin API endpoints. Keep this secure.

### STRIPE_SECRET_KEY
**Priority**: CRITICAL
**Source**: Stripe Dashboard → Developers → API Keys

Copy the **Live mode** secret key (starts with `sk_live_...`)

⚠️ NEVER use test keys in production!

### CLERK_SECRET_KEY
**Priority**: CRITICAL
**Source**: Clerk Dashboard → API Keys

Copy the **Production** secret key (starts with `sk_live_...`)

## High Priority Secrets

### STRIPE_PUBLISHABLE_KEY
**Priority**: HIGH
**Source**: Stripe Dashboard → Developers → API Keys

Copy the **Live mode** publishable key (starts with `pk_live_...`)

### PUBLIC_CLERK_PUBLISHABLE_KEY
**Priority**: HIGH
**Source**: Clerk Dashboard → API Keys

Copy the **Production** publishable key (starts with `pk_live_...`)

### STRIPE_WEBHOOK_SECRET
**Priority**: HIGH
**Source**: Created after first deployment (see Phase 3.2 in deployment plan)

1. Deploy API first
2. Go to Stripe Dashboard → Developers → Webhooks
3. Add endpoint: `https://[your-api-domain]/webhooks/stripe`
4. Select events (see Stripe webhook documentation)
5. Copy signing secret (starts with `whsec_...`)

## Optional Secrets (Monitoring & Alerts)

### SLACK_WEBHOOK_URL
**Priority**: MEDIUM (highly recommended for production monitoring)
**Source**: Slack → Apps → Incoming Webhooks

1. Go to https://api.slack.com/apps
2. Create new app or select existing
3. Enable Incoming Webhooks
4. Add New Webhook to Workspace
5. Select channel for alerts
6. Copy webhook URL (starts with `https://hooks.slack.com/services/...`)

Used for critical alerts (daily close failures, errors, etc.)

### RESEND_API_KEY
**Priority**: MEDIUM (for email notifications)
**Source**: Resend Dashboard → API Keys

Create an API key with sending permissions.

### RESEND_FROM_EMAIL
**Priority**: MEDIUM
**Source**: Your verified sender email in Resend

Example: `noreply@your-domain.com`

### SENTRY_DSN
**Priority**: MEDIUM (highly recommended for production error tracking)
**Source**: Sentry.io → Projects → Create Project → Get DSN

1. Go to https://sentry.io
2. Create a new project (JavaScript / Cloudflare Workers)
3. Copy the DSN from project settings

Example: `https://[key]@[org].ingest.sentry.io/[project]`

**Features enabled**:
- Automatic error capture and reporting
- Request context (path, method, user ID)
- Performance monitoring (10% sample rate in production)
- Release tracking via Cloudflare version metadata

**Note**: The SDK uses `@sentry/cloudflare` with the official Hono integration. See [Sentry Hono on Cloudflare docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/hono/) for details

## Verification

After adding all secrets:

1. Go to Settings → Secrets and variables → Actions
2. Verify all critical secrets are listed
3. Update any that need changing (can't view existing values)

## Security Best Practices

- ✅ Rotate secrets regularly (every 90 days recommended)
- ✅ Use different secrets for staging and production
- ✅ Never commit secrets to git
- ✅ Limit secret access to necessary team members
- ✅ Use Stripe test keys in development, live keys only in production
- ❌ Never share secrets via Slack, email, or other channels
- ❌ Don't reuse the same secret across multiple services

## Troubleshooting

**Deployment fails with "Invalid credentials"**
- Check CLOUDFLARE_API_TOKEN has correct permissions
- Verify CLOUDFLARE_ACCOUNT_ID matches your account

**Stripe webhooks not working**
- Verify STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
- Check webhook endpoint URL is correct
- Ensure API is deployed and accessible

**Clerk auth failing**
- Verify CLERK_SECRET_KEY is for production instance
- Check PUBLIC_CLERK_PUBLISHABLE_KEY matches secret key environment
- Ensure both keys are from the same Clerk instance
