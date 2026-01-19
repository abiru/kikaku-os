#!/bin/sh
set -e

# Stripe Webhook Smoke Test
# Prerequisites:
# - Stripe CLI installed and logged in
# - Local API server running on PORT (default 8787)
# - .dev.vars with valid STRIPE_WEBHOOK_SECRET

PORT="${PORT:-8787}"
BASE_URL="http://127.0.0.1:$PORT"
ADMIN_KEY="${ADMIN_API_KEY:-test-admin-key}"

echo "=== Stripe Webhook Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# Check if server is running
if ! curl -sf "$BASE_URL/dev/ping" >/dev/null 2>&1; then
  echo "ERROR: Server not responding at $BASE_URL"
  echo "Start the server with: pnpm dev"
  exit 1
fi

# Check if Stripe CLI is available
if ! command -v stripe >/dev/null 2>&1; then
  echo "WARNING: Stripe CLI not found. Skipping live webhook test."
  echo "Install from: https://stripe.com/docs/stripe-cli"
  echo ""
  echo "Running basic endpoint test only..."

  # Test webhook endpoint responds (expects 400 for invalid signature)
  WEBHOOK_RES=$(curl -sf -o /dev/null -w '%{http_code}' \
    -X POST \
    -H 'content-type: application/json' \
    -H 'stripe-signature: t=123,v1=invalid' \
    -d '{"id":"evt_test","type":"test"}' \
    "$BASE_URL/webhooks/stripe" || true)

  if [ "$WEBHOOK_RES" = "400" ]; then
    echo "✓ Webhook endpoint rejects invalid signature (400)"
  else
    echo "✗ Unexpected response: $WEBHOOK_RES (expected 400)"
    exit 1
  fi

  echo ""
  echo "=== Basic smoke test passed ==="
  exit 0
fi

# Full test with Stripe CLI
echo "Stripe CLI found. Running full webhook test..."

# Start webhook forwarding in background
STRIPE_LOG=$(mktemp)
stripe listen --forward-to "$BASE_URL/webhooks/stripe" --log-level warn > "$STRIPE_LOG" 2>&1 &
STRIPE_PID=$!

cleanup() {
  if [ -n "$STRIPE_PID" ]; then
    kill "$STRIPE_PID" 2>/dev/null || true
    wait "$STRIPE_PID" 2>/dev/null || true
  fi
  rm -f "$STRIPE_LOG" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for stripe listen to be ready
echo "Waiting for Stripe CLI to connect..."
sleep 3

# Trigger test events
echo ""
echo "Triggering checkout.session.completed..."
stripe trigger checkout.session.completed --add checkout_session:metadata[orderId]=1 2>&1 || true

sleep 2

echo ""
echo "Triggering charge.refunded..."
stripe trigger charge.refunded 2>&1 || true

sleep 2

# Check stripe_events table via admin API
echo ""
echo "Checking stripe_events in database..."
EVENTS_RES=$(curl -sf -H "x-admin-key: $ADMIN_KEY" "$BASE_URL/admin/stripe-events?perPage=5" 2>/dev/null || echo '{"ok":false}')

if echo "$EVENTS_RES" | grep -q '"ok":true'; then
  EVENTS_COUNT=$(echo "$EVENTS_RES" | grep -o '"event_id"' | wc -l | tr -d ' ')
  echo "✓ Found $EVENTS_COUNT recent stripe events"
else
  echo "⚠ Could not fetch stripe events (admin API may require auth)"
fi

echo ""
echo "=== Webhook smoke test completed ==="
echo ""
echo "To see detailed logs, check: $STRIPE_LOG"
echo "Or run: stripe logs tail"
