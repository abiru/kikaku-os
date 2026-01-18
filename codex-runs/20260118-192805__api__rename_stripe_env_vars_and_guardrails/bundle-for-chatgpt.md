# Codex run
- title: api: rename stripe env vars and guardrails
- generated: 2026-01-18T19:33:22+09:00
- branch: main
- head: c13c206

## Repo context
=== Codex Context (short) ===
2026-01-18T19:28:09+09:00

## Repo
branch: main
head:   c13c206

## Status
## main...origin/main
 M README.md
 M apps/api/package.json
?? codex-runs/20260118-192805__api__rename_stripe_env_vars_and_guardrails/

## Changed files (HEAD..WT)
README.md
apps/api/package.json

## Diff stats (HEAD..WT)
 README.md             | 6 +++---
 apps/api/package.json | 2 +-
 2 files changed, 4 insertions(+), 4 deletions(-)

## Recent commits
c13c206 api: stabilize smoke script (devvars swap + quiet curl)
0e49b18 codex-run: api: add api smoke test and dev ping
1d26a17 api: add api smoke test and dev ping
d40fee5 codex-run: api: clarify local dev vars and port
fd86786 api: clarify local dev vars and port
6b2bb05 codex-run: api: fix d1 mock shape in dev tests
ad37272 api: fix d1 mock shape in dev tests
4ca6aee codex-run: api: fix stripe price provisioning and lookup
67244da api: fix stripe price provisioning and lookup
5598791 api: checkout session stripe error handling
f92fade codex-run: api: checkout session stripe error handling
b45a9b7 api: checkout session stripe error handling
c160396 docs: clarify stripe env vars and guardrails
4d140ae codex-run: api: rename stripe secret env and add guardrails
2bc0550 codex-run: docs: stripe env var cleanup documentation
53a1269 codex-run: docs: stripe env var cleanup documentation
5142491 codex-run: api: rename stripe env var and guardrails
8edc87d codex-run: api: verify warn leftover
5d3560f codex-run: api: verify prompts not staged
29419dc codex-run: api: verify docs autoscope

_(full context: codex-runs/20260118-192805__api__rename_stripe_env_vars_and_guardrails/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Eliminate Stripe key confusion by renaming env vars and adding guardrails so pk/sk cannot be mixed up.

Constraints:

- Keep behavior working in local dev.
- No secrets in repo.
- Keep changes minimal and explicit (no refactors).
- Output: unified diff + 8 verification commands.

Tasks:

1. API side:
   - Replace usage of c.env.STRIPE_API_KEY with c.env.STRIPE_SECRET_KEY in:
     - apps/api/src/routes/checkout.ts
     - apps/api/src/routes/dev.ts (provision-stripe-prices)
   - Add validation:
     - If STRIPE_SECRET_KEY missing -> return 500 "Stripe API key not configured" (keep message)
     - If STRIPE*SECRET_KEY starts with "pk*" -> return 500 with clear message (still safe for users)
2. Storefront side (only if currently needed):
   - If any Stripe publishable key is used in storefront, rename to PUBLIC*STRIPE_PUBLISHABLE_KEY and validate it starts with "pk*".
   - If storefront doesn’t use it, do not add new usage.
3. Add example env files (no real keys):
   - apps/api/.dev.vars.example (or similar, follow existing conventions)
   - apps/storefront/.env.example (if storefront expects PUBLIC_API_BASE or similar)
   - Root README update (very small) showing which key goes where.
4. Ensure dev instructions still match wrangler usage.

Verification commands (must be copy/paste ready):

- rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
- rg -n "STRIPE_SECRET_KEY" apps/api
- cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
- (set wrong key) STRIPE_SECRET_KEY=pk_test_xxx ... verify endpoint returns 500 with message
- (set correct key) STRIPE_SECRET_KEY=sk_test_xxx ... verify /dev/provision-stripe-prices works with x-admin-key
- curl checkout/session returns 200 (or expected next error if missing provider_price_id)
- pnpm -C apps/api test (if exists)
- pnpm -C apps/storefront build

Keep output compact.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-192805__api__rename_stripe_env_vars_and_guardrails/prompt.md)
```

## Codex output
```
Updated `README.md` to make the Stripe key placement explicit (root `.dev.vars` is the source of truth; `apps/api/.dev.vars.example` is reference-only) so the pk/sk split is unambiguous. The API routes already use `STRIPE_SECRET_KEY` with the pk* guardrails in `apps/api/src/routes/checkout.ts` and `apps/api/src/routes/dev.ts`, and storefront has no publishable key usage to rename.

Note: `README.md` already had local edits before this change (the API env copy instructions); the unified diff below includes those pre-existing edits. I left other local changes (`apps/api/package.json`, `codex-runs/...`) untouched.

**Diff**
```diff
diff --git a/README.md b/README.md
index 706dbe6..b641a54 100644
--- a/README.md
+++ b/README.md
@@ -23,14 +23,14 @@
 ### API
 ```bash
 pnpm install --prefix apps/api
-# .dev.vars.example を .dev.vars にコピーして編集（APIキー等）
-cp apps/api/.dev.vars.example apps/api/.dev.vars
+# ルートの .dev.vars.example を .dev.vars にコピー（wrangler.toml と同階層が source-of-truth）
+cp .dev.vars.example .dev.vars
 pnpm -C apps/api dev -- --port 8787
 
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
+Stripe: `STRIPE_SECRET_KEY`(sk*) はルートの `.dev.vars` に設定（`apps/api/.dev.vars.example` は参照用）。`STRIPE_WEBHOOK_SECRET`(whsec*) もルートの `.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
 
 ### Admin
 ```bash
```

**Verification Commands** (commands 4–6 assume the API dev server is already running on `:8787`)
```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
perl -0777 -i -pe 's/^\s*STRIPE_SECRET_KEY\s*=.*$/STRIPE_SECRET_KEY=pk_test_xxx/m' .dev.vars && curl -sS -w "\n%{http_code}\n" -H content-type:application/json -d '{"variantId":1,"quantity":1}' http://127.0.0.1:8787/checkout/session
perl -0777 -i -pe 's/^\s*STRIPE_SECRET_KEY\s*=.*$/STRIPE_SECRET_KEY=sk_test_xxx/m' .dev.vars && curl -sS -w "\n%{http_code}\n" -H "x-admin-key: CHANGE_ME" -X POST http://127.0.0.1:8787/dev/provision-stripe-prices
curl -sS -w "\n%{http_code}\n" -H content-type:application/json -d '{"variantId":1,"quantity":1}' http://127.0.0.1:8787/checkout/session
pnpm -C apps/api test
pnpm -C apps/storefront build
```

If you want me to isolate the diff to only the new Stripe sentence (given the pre-existing README edits), say the word and I’ll do that.

... (output truncated in bundle; full output: codex-runs/20260118-192805__api__rename_stripe_env_vars_and_guardrails/codex-output.md)
```

