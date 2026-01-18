Updated the API setup docs to point to the root `.dev.vars` as the source-of-truth and kept the Stripe note consistent; made the smoke curl calls consistently silent; and ensured `scripts/codex-run.sh` creates the bundle output directory before writing. Left the existing `prompts/prompt.md` change and untracked `codex-runs/...` untouched.

**Patch**
```diff
diff --git a/README.md b/README.md
index 706dbe6..7a211de 100644
--- a/README.md
+++ b/README.md
@@ -23,14 +23,14 @@
 ### API
 ```bash
 pnpm install --prefix apps/api
-# .dev.vars.example を .dev.vars にコピーして編集（APIキー等）
-cp apps/api/.dev.vars.example apps/api/.dev.vars
+# ルートの .dev.vars.example を .dev.vars にコピー（wrangler.toml と同階層の .dev.vars が source-of-truth / apps/api/.dev.vars.example は参照用）
+cp .dev.vars.example .dev.vars
 pnpm -C apps/api dev -- --port 8787
 
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
+Stripe: `STRIPE_SECRET_KEY`(sk*) はルートの `.dev.vars` に設定（`apps/api/.dev.vars.example` は参照用）。`STRIPE_WEBHOOK_SECRET`(whsec*) もルートの `.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
 
 ### Admin
 ```bash
diff --git a/apps/api/package.json b/apps/api/package.json
index e4f6ac8..5608eac 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -8,7 +8,7 @@
     "dev": "wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}",
     "build": "wrangler build",
     "test": "vitest run",
-    "smoke": "sh -c \"set -e;\nPORT=\\${PORT:-8787};\nROOT_DEVVARS=../../.dev.vars;\nLOG=/tmp/kikaku-os-api-smoke-\\$PORT-\\$\\$.log;\nBAK=/tmp/kikaku-os-api-devvars-\\$PORT-\\$\\$.bak;\n\n# ポートが既に使われてたら誤判定になるので落とす\nif lsof -nP -iTCP:\\$PORT -sTCP:LISTEN >/dev/null 2>&1; then\n  echo Port \\$PORT already in use. Set PORT=... and retry.\n  exit 1\nfi\n\ncleanup(){\n  if [ -n \\${PID:-} ]; then kill \\$PID 2>/dev/null || true; wait \\$PID 2>/dev/null || true; fi\n  if [ -f \\$BAK ]; then mv \\$BAK \\$ROOT_DEVVARS 2>/dev/null || true; fi\n}\ntrap cleanup EXIT INT TERM\n\ntest -f \\$ROOT_DEVVARS || { echo Missing \\$ROOT_DEVVARS; exit 1; }\ncp \\$ROOT_DEVVARS \\$BAK\nperl -0777 -i -pe 's/^\\s*STRIPE_SECRET_KEY\\s*=.*$/STRIPE_SECRET_KEY=pk_test_xxx/m' \\$ROOT_DEVVARS\n\nPORT=\\$PORT pnpm dev >\\$LOG 2>&1 & PID=\\$!\n\nPING=\\$(curl -sS --retry 30 --retry-delay 1 --retry-connrefused -w '\\n%{http_code}' http://127.0.0.1:\\$PORT/dev/ping 2>/dev/null)\nPING_STATUS=\\$(printf '%s\\n' \\\"\\$PING\\\" | tail -n 1)\nPING_BODY=\\$(printf '%s\\n' \\\"\\$PING\\\" | sed '\\$d')\nprintf 'GET /dev/ping -> %s %s\\n' \\\"\\$PING_STATUS\\\" \\\"\\$PING_BODY\\\"\n[ \\\"\\$PING_STATUS\\\" = 200 ]\nprintf '%s' \\\"\\$PING_BODY\\\" | grep -Fq '\\\"dev_mode\\\":true'\nprintf '%s' \\\"\\$PING_BODY\\\" | grep -Fq '\\\"name\\\":\\\"kikaku-os-api\\\"'\n\nCHECKOUT=\\$(curl -sS -w '\\n%{http_code}' -H content-type:application/json -d '{\\\"variantId\\\":1,\\\"quantity\\\":1}' http://127.0.0.1:\\$PORT/checkout/session 2>/dev/null)\nCHECKOUT_STATUS=\\$(printf '%s\\n' \\\"\\$CHECKOUT\\\" | tail -n 1)\nCHECKOUT_BODY=\\$(printf '%s\\n' \\\"\\$CHECKOUT\\\" | sed '\\$d')\nprintf 'POST /checkout/session -> %s %s\\n' \\\"\\$CHECKOUT_STATUS\\\" \\\"\\$CHECKOUT_BODY\\\"\n[ \\\"\\$CHECKOUT_STATUS\\\" = 500 ]\nprintf '%s' \\\"\\$CHECKOUT_BODY\\\" | grep -Fq '\\\"code\\\":\\\"STRIPE_SECRET_KEY_INVALID\\\"'\n\""
+    "smoke": "sh -c \"set -e;\nPORT=\\${PORT:-8787};\nROOT_DEVVARS=../../.dev.vars;\nLOG=/tmp/kikaku-os-api-smoke-\\$PORT-\\$\\$.log;\nBAK=/tmp/kikaku-os-api-devvars-\\$PORT-\\$\\$.bak;\n\n# ポートが既に使われてたら誤判定になるので落とす\nif lsof -nP -iTCP:\\$PORT -sTCP:LISTEN >/dev/null 2>&1; then\n  echo Port \\$PORT already in use. Set PORT=... and retry.\n  exit 1\nfi\n\ncleanup(){\n  if [ -n \\${PID:-} ]; then kill \\$PID 2>/dev/null || true; wait \\$PID 2>/dev/null || true; fi\n  if [ -f \\$BAK ]; then mv \\$BAK \\$ROOT_DEVVARS 2>/dev/null || true; fi\n}\ntrap cleanup EXIT INT TERM\n\ntest -f \\$ROOT_DEVVARS || { echo Missing \\$ROOT_DEVVARS; exit 1; }\ncp \\$ROOT_DEVVARS \\$BAK\nperl -0777 -i -pe 's/^\\s*STRIPE_SECRET_KEY\\s*=.*$/STRIPE_SECRET_KEY=pk_test_xxx/m' \\$ROOT_DEVVARS\n\nPORT=\\$PORT pnpm dev >\\$LOG 2>&1 & PID=\\$!\n\nPING=\\$(curl -s --retry 30 --retry-delay 1 --retry-connrefused -w '\\n%{http_code}' http://127.0.0.1:\\$PORT/dev/ping)\nPING_STATUS=\\$(printf '%s\\n' \\\"\\$PING\\\" | tail -n 1)\nPING_BODY=\\$(printf '%s\\n' \\\"\\$PING\\\" | sed '\\$d')\nprintf 'GET /dev/ping -> %s %s\\n' \\\"\\$PING_STATUS\\\" \\\"\\$PING_BODY\\\"\n[ \\\"\\$PING_STATUS\\\" = 200 ]\nprintf '%s' \\\"\\$PING_BODY\\\" | grep -Fq '\\\"dev_mode\\\":true'\nprintf '%s' \\\"\\$PING_BODY\\\" | grep -Fq '\\\"name\\\":\\\"kikaku-os-api\\\"'\n\nCHECKOUT=\\$(curl -s -w '\\n%{http_code}' -H content-type:application/json -d '{\\\"variantId\\\":1,\\\"quantity\\\":1}' http://127.0.0.1:\\$PORT/checkout/session)\nCHECKOUT_STATUS=\\$(printf '%s\\n' \\\"\\$CHECKOUT\\\" | tail -n 1)\nCHECKOUT_BODY=\\$(printf '%s\\n' \\\"\\$CHECKOUT\\\" | sed '\\$d')\nprintf 'POST /checkout/session -> %s %s\\n' \\\"\\$CHECKOUT_STATUS\\\" \\\"\\$CHECKOUT_BODY\\\"\n[ \\\"\\$CHECKOUT_STATUS\\\" = 500 ]\nprintf '%s' \\\"\\$CHECKOUT_BODY\\\" | grep -Fq '\\\"code\\\":\\\"STRIPE_SECRET_KEY_INVALID\\\"'\n\""
   },
   "dependencies": {
     "hono": "^4.5.0"
diff --git a/scripts/codex-run.sh b/scripts/codex-run.sh
index ea9883f..bf2255b 100755
--- a/scripts/codex-run.sh
+++ b/scripts/codex-run.sh
@@ -280,6 +280,7 @@ set -e
 
 # --- bundle for ChatGPT paste (compact by default) ---
 BUNDLE="$RUN_DIR/bundle-for-chatgpt.md"
+mkdir -p "$(dirname "$BUNDLE")"
 {
   echo "# Codex run"
   echo "- title: $TITLE"
```

**Commit**
- Message: `docs/infra: clarify dev vars and harden smoke bundle output`
- Stage: `git add README.md apps/api/package.json scripts/codex-run.sh`

**Verification Commands**
```bash
pnpm -C apps/api test
pnpm -C apps/api smoke
node -p "require('./apps/api/package.json').scripts.dev"
node -p "require('./apps/api/package.json').scripts.smoke"
rg -n "Local API|.dev.vars.example|\\.dev\\.vars|8787|PORT=" README.md
ls -l .dev.vars.example && sed -n '1,80p' .dev.vars.example
git diff --stat
git status --short
git commit -m "docs/infra: clarify dev vars and harden smoke bundle output"
git push
```
