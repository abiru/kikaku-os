#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

if [[ ! -f .dev.vars ]]; then
  cp .dev.vars.example .dev.vars
fi

upsert_env .dev.vars ADMIN_API_KEY CHANGE_ME
upsert_env .dev.vars DEV_MODE true
upsert_env .dev.vars STOREFRONT_BASE_URL http://localhost:4321

if [[ ! -f apps/storefront/.env ]]; then
  cp apps/storefront/.env.example apps/storefront/.env
fi

upsert_env apps/storefront/.env PUBLIC_API_BASE http://localhost:8787
upsert_env apps/storefront/.env PUBLIC_CLERK_PUBLISHABLE_KEY pk_test_Y2xlcmsubG9jYWxob3N0LmNvbSQ=
upsert_env apps/storefront/.env CLERK_SECRET_KEY sk_test_fake_local_key

pnpm db:migrate

pnpm exec playwright test -c playwright.seed.config.ts "$@"
