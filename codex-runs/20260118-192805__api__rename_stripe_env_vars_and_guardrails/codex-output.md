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
