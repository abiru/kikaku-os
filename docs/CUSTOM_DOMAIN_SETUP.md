# Custom Domain Setup Guide

Configure custom domains for your API and Storefront.

## Prerequisites

- Domain registered and managed in Cloudflare (or DNS pointing to Cloudflare)
- API and Storefront deployed to Cloudflare Workers/Pages
- SSL certificates (auto-provisioned by Cloudflare)

## Recommended Domain Structure

- **API**: `api.your-domain.com`
- **Storefront**: `www.your-domain.com` or `your-domain.com`
- **Admin**: Same as storefront, route-based (`/admin/*`)

## Step 1: API Custom Domain (Cloudflare Workers)

### Option A: Workers Custom Domain (Recommended)

1. **Cloudflare Dashboard** → Workers & Pages
2. Select `kikaku-os-api` worker
3. Click **Triggers** tab
4. Scroll to **Custom Domains** section
5. Click "Add Custom Domain"
6. Enter domain: `api.your-domain.com`
7. Click "Add Custom Domain"

Cloudflare will:
- Automatically create DNS records
- Provision SSL certificate
- Route traffic to your worker

**Verification**:
```bash
dig api.your-domain.com
# Should return Cloudflare IP addresses

curl https://api.your-domain.com/health
# Should return health check response
```

### Option B: Workers Routes

Add to `wrangler.toml`:

```toml
routes = [
  { pattern = "api.your-domain.com/*", zone_name = "your-domain.com" }
]
```

Then deploy:
```bash
pnpm exec wrangler deploy
```

## Step 2: Storefront Custom Domain (Cloudflare Pages)

1. **Cloudflare Dashboard** → Pages
2. Select `kikaku-storefront` project
3. Click **Custom domains** tab
4. Click "Set up a custom domain"
5. Enter domain: `www.your-domain.com` (or apex: `your-domain.com`)
6. Click "Continue"
7. Choose "Activate domain"

Cloudflare will:
- Create DNS records (CNAME for www, or A/AAAA for apex)
- Provision SSL certificate
- Enable automatic HTTPS redirects

**For apex domain** (`your-domain.com`):
- Also add `www.your-domain.com` as an alias
- Or set up redirect from apex to www

**Verification**:
```bash
dig www.your-domain.com
# Should return Cloudflare addresses

curl https://www.your-domain.com/
# Should return storefront HTML
```

## Step 3: Update Configuration Files

After domains are active, update these files:

### 1. wrangler.toml

```toml
[vars]
STOREFRONT_BASE_URL = "https://www.your-domain.com"
```

### 2. .github/workflows/deploy.yml

Update ALL occurrences of:
- `https://kikaku-os-api.workers.dev` → `https://api.your-domain.com`
- `https://kikaku-storefront.pages.dev` → `https://www.your-domain.com`

Locations:
- `build-storefront` job: `PUBLIC_API_BASE` env var
- `deploy-api` job: `Verify API deployment` step
- `deploy-storefront` job: `PUBLIC_API_BASE` env var + verification
- `smoke-test` job: `API_URL` variable

### 3. apps/api/src/index.ts

CORS configuration is already dynamic - it reads from `env.STOREFRONT_BASE_URL`.

Verify the `getAllowedOrigins()` function includes production URL.

### 4. Stripe Webhook URL

Update Stripe webhook endpoint URL:

1. Stripe Dashboard → Developers → Webhooks
2. Edit your webhook endpoint
3. Change URL to: `https://api.your-domain.com/webhooks/stripe`
4. Save changes

### 5. Clerk Settings

Update Clerk allowed origins:

1. Clerk Dashboard → Your app → Settings
2. Add to **Allowed origins**:
   - `https://www.your-domain.com`
   - `https://api.your-domain.com`

## Step 4: Redeploy

After updating configuration:

```bash
# Commit changes
git add wrangler.toml .github/workflows/deploy.yml
git commit -m "feat: configure custom domains for production"
git push origin main

# Or manual deploy
cd apps/api
pnpm exec wrangler deploy
```

## Step 5: Verification Checklist

- [ ] API domain resolves: `dig api.your-domain.com`
- [ ] Storefront domain resolves: `dig www.your-domain.com`
- [ ] SSL certificates active (visit in browser, check for 🔒)
- [ ] API health check works: `curl https://api.your-domain.com/health`
- [ ] Storefront loads: `curl https://www.your-domain.com/`
- [ ] CORS allows storefront origin (test checkout flow)
- [ ] Stripe webhooks deliver successfully
- [ ] Clerk auth works on storefront
- [ ] All smoke tests pass: `./scripts/smoke-test-prod.sh`

## DNS Propagation

DNS changes can take up to 48 hours to propagate globally, but typically complete in minutes with Cloudflare.

**Check propagation**:
```bash
# Check from different locations
dig @8.8.8.8 api.your-domain.com          # Google DNS
dig @1.1.1.1 api.your-domain.com          # Cloudflare DNS
dig @8.8.4.4 www.your-domain.com          # Google DNS alternate
```

## SSL Certificate Troubleshooting

Cloudflare auto-provisions SSL certificates. If seeing SSL errors:

1. **Check SSL/TLS mode**:
   - Dashboard → SSL/TLS → Overview
   - Should be "Full" or "Full (strict)"

2. **Check certificate status**:
   - Dashboard → SSL/TLS → Edge Certificates
   - Status should be "Active"

3. **Force HTTPS**:
   - Dashboard → SSL/TLS → Edge Certificates
   - Enable "Always Use HTTPS"

4. **Clear browser cache** and test in incognito mode

## Rollback to Default Domains

If issues occur, you can temporarily rollback:

1. Remove custom domains from Workers/Pages dashboard
2. Revert `wrangler.toml` changes
3. Update Stripe webhook to `.workers.dev` URL
4. Redeploy

## Advanced: WWW Redirect

To redirect `your-domain.com` → `www.your-domain.com`:

1. Dashboard → Rules → Redirect Rules
2. Create rule:
   - If: Hostname equals `your-domain.com`
   - Then: Dynamic redirect to `https://www.your-domain.com$request.uri`
   - Status code: 301 (Permanent)

Or use Pages redirect:

Create `apps/storefront/public/_redirects`:
```
https://your-domain.com/* https://www.your-domain.com/:splat 301!
```

## Multiple Environments

For staging + production:

**Production**:
- API: `api.your-domain.com`
- Storefront: `www.your-domain.com`

**Staging**:
- API: `api-staging.your-domain.com`
- Storefront: `staging.your-domain.com`

Use separate Cloudflare projects and wrangler environments.

## Monitoring

After setting up custom domains:

1. **Add to monitoring**: Update health check URLs in your monitoring tools
2. **Update documentation**: Document new URLs in README
3. **Notify team**: Share new URLs with team members
4. **Update bookmarks**: Update any saved development URLs

## Cost Notes

- Custom domains on Cloudflare Workers/Pages: **FREE**
- SSL certificates: **FREE** (auto-provisioned)
- No additional DNS costs (included with Cloudflare)

This is a major advantage over other platforms that charge for custom domains.
