#!/bin/bash
set -e

# Production smoke test script
# Run this after each deployment to verify critical endpoints
# Based on docs/VERIFICATION_CHECKLIST.md

API_URL="${API_URL:-https://kikaku-os-api.workers.dev}"
STOREFRONT_URL="${STOREFRONT_URL:-https://kikaku-storefront.pages.dev}"

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@"; then
    echo "✓ $label"
    PASS=$((PASS + 1))
  else
    echo "✗ $label"
    FAIL=$((FAIL + 1))
  fi
}

expect_status() {
  local url="$1"
  local expected="$2"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$actual" = "$expected" ]; then
    return 0
  else
    echo "  Expected $expected, got $actual"
    return 1
  fi
}

expect_not_status() {
  local url="$1"
  local rejected="$2"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$actual" != "$rejected" ]; then
    echo "  Got status: $actual (not $rejected)"
    return 0
  else
    echo "  Got unexpected $rejected"
    return 1
  fi
}

echo "Running production smoke tests..."
echo "API: $API_URL"
echo "Storefront: $STOREFRONT_URL"
echo ""

# ── Section 1: API Health ──────────────────────────────────────────

echo "== API Health =="
check "Health check (database)" \
  bash -c "curl -sf '$API_URL/health' | jq -e '.database == \"ok\"' > /dev/null"

check "Health check (r2)" \
  bash -c "curl -sf '$API_URL/health' | jq -e '.r2 == \"ok\"' > /dev/null"

check "Health check (secrets)" \
  bash -c "curl -sf '$API_URL/health' | jq -e '.secrets == \"ok\"' > /dev/null"

check "API root endpoint" \
  bash -c "curl -sf '$API_URL/' | jq -e '.message == \"led kikaku os api\"' > /dev/null"

echo ""

# ── Section 2: Storefront ─────────────────────────────────────────

echo "== Storefront =="
check "Storefront loads" \
  bash -c "curl -sf '$STOREFRONT_URL/' | grep -q 'Led Kikaku'"

echo ""

# ── Section 3: Store Endpoints ─────────────────────────────────────

echo "== Store Endpoints =="
check "Store products" \
  bash -c "curl -sf '$API_URL/store/products' | jq -e '.ok == true' > /dev/null"

check "Store products pagination" \
  bash -c "curl -sf '$API_URL/store/products?limit=2' | jq -e '.pagination' > /dev/null"

check "Store product filters" \
  bash -c "curl -sf '$API_URL/store/products/filters' | jq -e '.ok == true' > /dev/null"

echo ""

# ── Section 4: Auth Protection ─────────────────────────────────────

echo "== Auth Protection =="
check "Admin products requires auth (401)" \
  expect_status "$API_URL/admin/products" "401"

check "Inbox requires auth (401)" \
  expect_status "$API_URL/inbox" "401"

check "Reports requires auth (401)" \
  expect_status "$API_URL/reports/daily?date=2026-01-01" "401"

check "Inventory requires auth (401)" \
  expect_status "$API_URL/inventory/low" "401"

echo ""

# ── Section 5: Checkout / Payment Endpoints ────────────────────────

echo "== Checkout / Payment Endpoints =="
check "Checkout session rejects empty body (not 500)" \
  expect_not_status "$API_URL/checkout/session" "500"

check "Payment create-intent rejects empty body (not 500)" \
  expect_not_status "$API_URL/payments/create-intent" "500"

check "Quotation rejects invalid token (not 500)" \
  expect_not_status "$API_URL/quotations/nonexistent-token" "500"

echo ""

# ── Section 6: Webhook Endpoint ────────────────────────────────────

echo "== Webhook Endpoint =="
check "Stripe webhook rejects unsigned request (not 500)" \
  expect_not_status "$API_URL/webhooks/stripe" "500"

echo ""

# ── Section 7: Cron / Scheduled Handler ────────────────────────────

echo "== Cron / Scheduled Handler =="
check "Scheduled handler endpoint accessible (not 500)" \
  expect_not_status "$API_URL/cdn-cgi/handler/scheduled" "500"

echo ""

# ── Summary ────────────────────────────────────────────────────────

echo "== Results =="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL test(s) failed"
  exit 1
fi

echo "All smoke tests passed!"
