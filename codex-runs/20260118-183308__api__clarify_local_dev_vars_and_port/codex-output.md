Updated the API dev script to explicitly use the root `wrangler.toml` and a predictable port (with optional `PORT` override), added a root `.dev.vars.example`, and tightened README guidance so the root `.dev.vars` is the source-of-truth and the Local API steps are unambiguous.

```diff
diff --git a/.dev.vars.example b/.dev.vars.example
new file mode 100644
index 0000000..dada717
--- /dev/null
+++ b/.dev.vars.example
@@ -0,0 +1,5 @@
+ADMIN_API_KEY=CHANGE_ME
+DEV_MODE=true
+STOREFRONT_BASE_URL=http://localhost:4321
+STRIPE_SECRET_KEY=sk_test_replace
+STRIPE_WEBHOOK_SECRET=whsec_replace
diff --git a/README.md b/README.md
index 706dbe6..946be45 100644
--- a/README.md
+++ b/README.md
@@ -13,7 +13,7 @@
 依存は pnpm を推奨します。
 
 ### 共通
-- 環境変数: `ADMIN_API_KEY` を wrangler.toml に設定
+- 環境変数: `ADMIN_API_KEY` などは repo root の `.dev.vars`（`wrangler.toml` の隣）に設定
 - API: http://localhost:8787
 - Admin: http://localhost:5173
 - Storefront: http://localhost:4321
@@ -21,16 +21,24 @@
 - ローカルseed: `DEV_MODE=true` のときのみ `/dev/seed` が有効
 
 ### API
+#### Local API
+```bash
+cp .dev.vars.example .dev.vars
+pnpm -C apps/api dev
+# API: http://localhost:8787 (busy? PORT=8789 pnpm -C apps/api dev)
+```
+`pnpm -C apps/api dev` は `../../.dev.vars` を読む（source of truth は repo root）。
+
 ```bash
 pnpm install --prefix apps/api
-# .dev.vars.example を .dev.vars にコピーして編集（APIキー等）
-cp apps/api/.dev.vars.example apps/api/.dev.vars
-pnpm -C apps/api dev -- --port 8787
+# .dev.vars.example を repo root の .dev.vars にコピーして編集（APIキー等）
+cp .dev.vars.example .dev.vars
+pnpm -C apps/api dev
 
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
+Stripe: `STRIPE_SECRET_KEY`(sk*) と `STRIPE_WEBHOOK_SECRET`(whsec*) は repo root の `.dev.vars` に設定（`.dev.vars` はローカル管理でコミットしない）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
diff --git a/apps/api/package.json b/apps/api/package.json
index 00cbf53..213a412 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -5,7 +5,7 @@
   "module": "esnext",
   "type": "module",
   "scripts": {
-    "dev": "wrangler dev --local",
+    "dev": "wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}",
     "build": "wrangler build",
     "test": "vitest run"
   },
```

Verification commands:
1. `pnpm -C apps/api dev 2>&1 | rg -m 1 "Using vars defined in"`
2. `node -p "require('./apps/api/package.json').scripts.dev"`
3. `ls -l .dev.vars.example && sed -n '1,40p' .dev.vars.example`
4. `PORT=8787 pnpm -C apps/api dev > /tmp/api-dev-8787.log 2>&1 & API_PID=$!; sleep 2; (curl -sS -D - http://localhost:8787/dev/ping -o /dev/null || curl -I http://localhost:8787/); kill $API_PID`
5. `PORT=8789 pnpm -C apps/api dev > /tmp/api-dev-8789.log 2>&1 & API_PID=$!; sleep 2; (curl -sS -D - http://localhost:8789/dev/ping -o /dev/null || curl -I http://localhost:8789/); kill $API_PID`
6. `rg -n ".dev.vars.example" README.md`
7. `pnpm -C apps/api test`
8. `git status --short`

I noticed pre-existing changes in `prompts/prompt.md` that I did not make; should I ignore those and proceed?
