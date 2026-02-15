#!/bin/bash
set -euo pipefail

# Production Config Verification Script
# Checks wrangler.toml, .dev.vars migration, and environment setup
# for common production misconfigurations.
#
# Usage: ./scripts/verify-prod-config.sh
#
# This script is READ-ONLY - it checks configs but never modifies them.

PASS=0
WARN=0
FAIL=0

pass() {
  echo "  [PASS] $1"
  PASS=$((PASS + 1))
}

warn() {
  echo "  [WARN] $1"
  WARN=$((WARN + 1))
}

fail() {
  echo "  [FAIL] $1"
  FAIL=$((FAIL + 1))
}

# ── Locate project root ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER_TOML="$PROJECT_ROOT/wrangler.toml"
DEV_VARS_EXAMPLE="$PROJECT_ROOT/.dev.vars.example"
STOREFRONT_ENV_EXAMPLE="$PROJECT_ROOT/apps/storefront/.env.example"
DEPLOY_YML="$PROJECT_ROOT/.github/workflows/deploy.yml"

echo "============================================"
echo "  Production Config Verification"
echo "============================================"
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

# ── 1. wrangler.toml existence ──────────────────────────────────────
echo "== 1. wrangler.toml =="

if [ ! -f "$WRANGLER_TOML" ]; then
  fail "wrangler.toml not found at $WRANGLER_TOML"
  echo ""
  echo "Cannot continue without wrangler.toml."
  exit 1
fi
pass "wrangler.toml exists"

# ── 2. DEV_MODE check ──────────────────────────────────────────────
echo ""
echo "== 2. DEV_MODE =="

DEV_MODE_VALUE=$(grep -E '^\s*DEV_MODE\s*=' "$WRANGLER_TOML" | head -1 | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -z "$DEV_MODE_VALUE" ]; then
  warn "DEV_MODE not found in wrangler.toml [vars] section"
elif [ "$DEV_MODE_VALUE" = "false" ]; then
  pass "DEV_MODE = \"false\" in wrangler.toml"
else
  fail "DEV_MODE = \"$DEV_MODE_VALUE\" in wrangler.toml (must be \"false\" for production)"
fi

# ── 3. STOREFRONT_BASE_URL check ───────────────────────────────────
echo ""
echo "== 3. STOREFRONT_BASE_URL (CORS origin) =="

STOREFRONT_URL=$(grep -E '^\s*STOREFRONT_BASE_URL\s*=' "$WRANGLER_TOML" | head -1 | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -z "$STOREFRONT_URL" ]; then
  warn "STOREFRONT_BASE_URL not set in wrangler.toml"
elif echo "$STOREFRONT_URL" | grep -qiE 'localhost|127\.0\.0\.1'; then
  fail "STOREFRONT_BASE_URL contains localhost: $STOREFRONT_URL"
  echo "        Production must use a real domain (e.g., https://your-domain.com)"
else
  pass "STOREFRONT_BASE_URL = $STOREFRONT_URL (not localhost)"
fi

# ── 4. D1 Database configuration ───────────────────────────────────
echo ""
echo "== 4. D1 Database =="

DB_ID=$(grep -E '^\s*database_id\s*=' "$WRANGLER_TOML" | head -1 | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -z "$DB_ID" ]; then
  fail "database_id not found in wrangler.toml"
elif echo "$DB_ID" | grep -qiE 'DUMMY|REPLACE|TODO|xxx'; then
  fail "database_id appears to be a placeholder: $DB_ID"
else
  pass "database_id is set: ${DB_ID:0:8}..."
fi

DB_NAME=$(grep -E '^\s*database_name\s*=' "$WRANGLER_TOML" | head -1 | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -z "$DB_NAME" ]; then
  fail "database_name not found in wrangler.toml"
else
  pass "database_name = $DB_NAME"
fi

# ── 5. R2 Bucket configuration ─────────────────────────────────────
echo ""
echo "== 5. R2 Bucket =="

R2_NAME=$(grep -E '^\s*bucket_name\s*=' "$WRANGLER_TOML" | head -1 | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -z "$R2_NAME" ]; then
  fail "bucket_name not found in wrangler.toml"
else
  pass "bucket_name = $R2_NAME"
fi

# ── 6. Wrangler secrets (documented in wrangler.toml comments) ─────
echo ""
echo "== 6. Required Wrangler Secrets =="
echo "  These must be set via 'wrangler secret put' or GitHub Actions secrets:"

REQUIRED_SECRETS=(
  "ADMIN_API_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_PUBLISHABLE_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "CLERK_SECRET_KEY"
)

OPTIONAL_SECRETS=(
  "CLAUDE_API_KEY"
  "SLACK_WEBHOOK_URL"
  "RESEND_API_KEY"
  "SENTRY_DSN"
  "AI_GATEWAY_ACCOUNT_ID"
  "AI_GATEWAY_ID"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
  echo "  - [REQUIRED] $secret"
done
for secret in "${OPTIONAL_SECRETS[@]}"; do
  echo "  - [optional] $secret"
done
echo ""
echo "  Tip: Run 'wrangler secret list' to see which secrets are configured."

# ── 7. GitHub Actions secrets ──────────────────────────────────────
echo ""
echo "== 7. GitHub Actions Secrets =="

if [ -f "$DEPLOY_YML" ]; then
  pass "deploy.yml exists at .github/workflows/deploy.yml"

  # Extract referenced secrets from deploy.yml
  REFERENCED_SECRETS=$(grep -oP 'secrets\.\K[A-Z_]+' "$DEPLOY_YML" | sort -u)
  echo ""
  echo "  Secrets referenced in deploy.yml (must be set in GitHub repo settings):"
  for s in $REFERENCED_SECRETS; do
    echo "  - $s"
  done
else
  warn "deploy.yml not found - cannot verify GitHub Actions secrets"
fi

# ── 8. Test/dev key leakage check ──────────────────────────────────
echo ""
echo "== 8. Test/Dev Key Detection in wrangler.toml =="

# Check for test Stripe keys
if grep -qiE 'sk_test_|pk_test_' "$WRANGLER_TOML"; then
  fail "Test Stripe keys found in wrangler.toml (use wrangler secrets for live keys)"
else
  pass "No test Stripe keys in wrangler.toml"
fi

# Check for placeholder values in [vars]
if grep -qiE 'CHANGE_ME|sk_test_xxx|pk_test_xxx|whsec_xxx|sk-ant-xxx' "$WRANGLER_TOML"; then
  fail "Placeholder values found in wrangler.toml (e.g., CHANGE_ME, sk_test_xxx)"
else
  pass "No obvious placeholder values in wrangler.toml"
fi

# Check for hardcoded secrets in [vars] section (secrets should use wrangler secret put)
VARS_SECTION=false
while IFS= read -r line; do
  if echo "$line" | grep -qE '^\[vars\]'; then
    VARS_SECTION=true
    continue
  fi
  if echo "$line" | grep -qE '^\[' && [ "$VARS_SECTION" = true ]; then
    break
  fi
  if [ "$VARS_SECTION" = true ]; then
    for secret in "${REQUIRED_SECRETS[@]}"; do
      if echo "$line" | grep -qE "^${secret}\s*="; then
        fail "Secret $secret is in [vars] section (should be wrangler secret, not plaintext)"
      fi
    done
  fi
done < "$WRANGLER_TOML"
pass "No required secrets exposed in [vars] section"

# ── 9. Observability ───────────────────────────────────────────────
echo ""
echo "== 9. Observability =="

if grep -qE '^\[observability\]' "$WRANGLER_TOML"; then
  OBS_ENABLED=$(grep -A1 '^\[observability\]' "$WRANGLER_TOML" | grep -E 'enabled\s*=' | sed 's/.*=\s*//;s/\s*$//')
  if [ "$OBS_ENABLED" = "true" ]; then
    pass "Observability enabled"
  else
    warn "Observability section exists but enabled != true"
  fi
else
  warn "No [observability] section in wrangler.toml"
fi

# ── 10. Cron triggers ──────────────────────────────────────────────
echo ""
echo "== 10. Cron Triggers =="

if grep -qE 'crons\s*=' "$WRANGLER_TOML"; then
  CRON_VALUE=$(grep -E 'crons\s*=' "$WRANGLER_TOML" | head -1)
  pass "Cron trigger configured: $CRON_VALUE"
else
  warn "No cron triggers found in wrangler.toml"
fi

# ── 11. Storefront .env check ─────────────────────────────────────
echo ""
echo "== 11. Storefront Environment =="

if [ -f "$STOREFRONT_ENV_EXAMPLE" ]; then
  pass ".env.example exists for storefront reference"
  echo ""
  echo "  Required storefront env vars for production build:"
  echo "  - PUBLIC_API_BASE (production API URL, not localhost)"
  echo "  - PUBLIC_CLERK_PUBLISHABLE_KEY (pk_live_... for production)"
  echo "  - CLERK_SECRET_KEY (sk_live_... for production)"
else
  warn "apps/storefront/.env.example not found"
fi

# ── 12. Company info ───────────────────────────────────────────────
echo ""
echo "== 12. Company Info (wrangler.toml [vars]) =="

COMPANY_NAME=$(grep -E '^\s*COMPANY_NAME\s*=' "$WRANGLER_TOML" | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -n "$COMPANY_NAME" ]; then
  pass "COMPANY_NAME = $COMPANY_NAME"
else
  warn "COMPANY_NAME not set"
fi

COMPANY_EMAIL=$(grep -E '^\s*COMPANY_EMAIL\s*=' "$WRANGLER_TOML" | sed 's/.*=\s*//;s/"//g;s/\s*$//')
if [ -n "$COMPANY_EMAIL" ]; then
  pass "COMPANY_EMAIL = $COMPANY_EMAIL"
else
  warn "COMPANY_EMAIL not set"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Summary"
echo "============================================"
echo "  PASS: $PASS"
echo "  WARN: $WARN"
echo "  FAIL: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: FAILED - fix $FAIL issue(s) before deploying"
  echo ""
  echo "  See docs/PRODUCTION_CONFIG.md for the full checklist."
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "  STATUS: PASSED with $WARN warning(s)"
  echo ""
  echo "  Review warnings above. See docs/PRODUCTION_CONFIG.md for details."
  exit 0
else
  echo "  STATUS: ALL CHECKS PASSED"
  exit 0
fi
