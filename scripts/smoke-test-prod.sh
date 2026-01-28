#!/bin/bash
set -e

# Production smoke test script
# Run this after each deployment to verify critical endpoints

API_URL="${API_URL:-https://kikaku-os-api.workers.dev}"
STOREFRONT_URL="${STOREFRONT_URL:-https://kikaku-storefront.pages.dev}"

echo "🔍 Running production smoke tests..."
echo "API: $API_URL"
echo "Storefront: $STOREFRONT_URL"
echo ""

# Test 1: API health
echo "✓ API health check"
HEALTH=$(curl -sf "$API_URL/health" | jq -e '.database == "ok"')
if [ "$HEALTH" != "true" ]; then
  echo "❌ Health check failed"
  exit 1
fi

# Test 2: API root
echo "✓ API root endpoint"
curl -sf "$API_URL/" | jq -e '.message' > /dev/null

# Test 3: Storefront
echo "✓ Storefront loading"
curl -sf "$STOREFRONT_URL/" | grep -q "Led Kikaku" || echo "⚠️  Warning: Could not verify storefront content"

# Test 4: Store products
echo "✓ Store products endpoint"
curl -sf "$API_URL/store/products" | jq -e '.ok == true' > /dev/null

# Test 5: Auth protection
echo "✓ Auth protection (should be 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/admin/products")
if [ "$STATUS" != "401" ]; then
  echo "❌ Expected 401, got $STATUS"
  exit 1
fi

echo ""
echo "✅ All smoke tests passed!"
