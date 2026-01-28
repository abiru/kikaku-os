# Stripe Webhook Configuration

Configure Stripe webhooks to receive payment events in production.

⚠️ **Important**: Complete this AFTER your first API deployment.

## Prerequisites

- API deployed to Cloudflare Workers
- Production API URL available (e.g., `https://api.your-domain.com` or `https://kikaku-os-api.workers.dev`)

## Step 1: Create Webhook Endpoint

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Switch to **Live mode** (toggle in top-right)
3. Navigate to: Developers → Webhooks
4. Click "Add endpoint"

## Step 2: Configure Endpoint

**Endpoint URL**:
```
https://[your-api-domain]/webhooks/stripe
```

Replace `[your-api-domain]` with your actual API domain:
- Custom domain: `https://api.your-domain.com/webhooks/stripe`
- Workers domain: `https://kikaku-os-api.workers.dev/webhooks/stripe`

**Description**: `Kikaku OS Production Webhook`

**Events to select**:

Click "Select events" and choose:

### Payment Events
- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `payment_intent.canceled` - Payment canceled

### Refund Events
- `charge.refunded` - Refund processed

### Checkout Events
- `checkout.session.completed` - Checkout session completed
- `checkout.session.expired` - Checkout session expired

### Customer Events
- `customer.created` - Customer record created
- `customer.updated` - Customer information updated
- `customer.deleted` - Customer deleted

### Optional Events (for future features)
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `subscription.created`
- `subscription.updated`
- `subscription.deleted`

**API Version**: Latest (Stripe automatically uses your account's default)

## Step 3: Get Signing Secret

1. After creating the endpoint, Stripe will show the webhook details
2. Under "Signing secret", click "Reveal"
3. Copy the secret (starts with `whsec_...`)

## Step 4: Add Secret to GitHub

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `STRIPE_WEBHOOK_SECRET`
4. Value: Paste the `whsec_...` secret
5. Click "Add secret"

## Step 5: Deploy with Secret

### Option A: Redeploy via GitHub Actions

1. Go to Actions → Deploy to Production
2. Click "Run workflow" → Run workflow
3. The deployment will automatically configure the secret

### Option B: Manual Secret Update

```bash
cd /home/abiru/Code/kikaku-os
echo "whsec_..." | pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
```

Replace `whsec_...` with your actual secret.

## Step 6: Test Webhook

### Using Stripe CLI

```bash
# Install Stripe CLI if not already installed
# https://stripe.com/docs/stripe-cli

# Trigger a test event
stripe trigger payment_intent.succeeded --webhook-endpoint https://[your-api-domain]/webhooks/stripe
```

### Using Stripe Dashboard

1. Go to Developers → Webhooks → [your endpoint]
2. Click "Send test webhook"
3. Select `payment_intent.succeeded`
4. Click "Send test webhook"
5. Check response - should be `200 OK`

## Verification

After configuring the webhook:

1. **Check Stripe Dashboard**:
   - Go to Developers → Webhooks → [your endpoint]
   - Status should be "Active"
   - Recent deliveries should show successful responses (200)

2. **Check API Logs** (if configured):
   ```bash
   wrangler tail kikaku-os-api --format pretty
   ```

3. **Test Real Payment**:
   - Complete a test purchase on your storefront
   - Check Stripe Dashboard → Webhooks → Recent events
   - Verify event was delivered successfully
   - Check admin dashboard for order/payment record

## Troubleshooting

### Webhook Returns 401 Unauthorized

The webhook endpoint is public and should NOT require authentication. Check:

```typescript
// In apps/api/src/index.ts
if (c.req.path.startsWith('/webhooks/stripe')) return next();
```

This should be present to bypass Clerk auth.

### Webhook Returns 400 Bad Request

**Invalid signature** - Secret mismatch between Stripe and your app.

1. Verify STRIPE_WEBHOOK_SECRET is correct
2. Check you're using the secret from the correct endpoint (live mode)
3. Redeploy with correct secret

### Events Not Being Processed

1. Check webhook is in **live mode** (not test mode)
2. Verify events are selected correctly
3. Check API logs for errors during event processing
4. Verify database connectivity (health endpoint: `/health`)

### Webhook Shows as Failing in Stripe Dashboard

1. Check "Recent deliveries" for error details
2. Common issues:
   - API endpoint not accessible (check deployment)
   - Database error (check D1 connection)
   - Invalid webhook secret
   - Processing timeout (check handler performance)

## Security Notes

- ✅ Webhook signature is verified automatically by Stripe SDK
- ✅ Endpoint is public (must be accessible to Stripe servers)
- ✅ Events are verified before processing
- ❌ Never process webhook data without signature verification
- ❌ Don't expose webhook secret in logs or error messages

## Webhook Handler Code

The webhook handler is at: `apps/api/src/routes/webhooks/stripe.ts`

Supported events:
- `payment_intent.succeeded` → Create payment record, update order status
- `payment_intent.payment_failed` → Log failure, update order
- `charge.refunded` → Create refund record
- `checkout.session.completed` → Process completed checkout
- `customer.created/updated` → Sync customer data

## Rotating Webhook Secret

To rotate the webhook secret (recommended every 90 days):

1. Stripe Dashboard → Webhooks → [endpoint] → "Roll secret"
2. Copy new secret
3. Update GitHub Secret: `STRIPE_WEBHOOK_SECRET`
4. Redeploy or run: `echo "whsec_..." | wrangler secret put STRIPE_WEBHOOK_SECRET`

⚠️ The old secret stops working immediately after rolling.

## Multiple Environments

For staging + production:

1. Create separate webhook endpoints for each environment
2. Use different secrets for each
3. Configure environment-specific secrets in GitHub

Example:
- Production: `https://api.your-domain.com/webhooks/stripe`
- Staging: `https://api-staging.your-domain.com/webhooks/stripe`
