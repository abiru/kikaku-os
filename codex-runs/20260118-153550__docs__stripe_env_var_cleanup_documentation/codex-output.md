Clarified the README’s Stripe key placement to explicitly state pk* is storefront-only and sk* is API-only (`README.md:33`).

I noticed an unexpected untracked directory: `codex-runs/20260118-153550__docs__stripe_env_var_cleanup_documentation/`. How would you like to proceed?
1) Leave it as-is
2) Delete it
3) Add it to `.gitignore`

```diff
diff --git a/README.md b/README.md
index 5cf7175..44eb5fe 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。
 
 ### Admin
 ```bash
```

Verification commands:
```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
bash -lc 'cat > apps/api/.dev.vars <<EOF
ADMIN_API_KEY=CHANGE_ME
DEV_MODE=true
STOREFRONT_BASE_URL=http://localhost:4321
STRIPE_SECRET_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
EOF
pnpm -C apps/api dev -- --port 8787 >/tmp/api-pk.log 2>&1 &
pid=$!
sleep 2
curl -sS -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d "{\"variantId\":1,\"quantity\":1}" | rg -n "publishable key|Stripe API key not configured"
kill $pid'
bash -lc 'cat > apps/api/.dev.vars <<EOF
ADMIN_API_KEY=CHANGE_ME
DEV_MODE=true
STOREFRONT_BASE_URL=http://localhost:4321
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
EOF
pnpm -C apps/api dev -- --port 8787 >/tmp/api-sk.log 2>&1 &
pid=$!
sleep 2
curl -sS -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"
kill $pid'
curl -sS -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'
pnpm -C apps/api test
pnpm -C apps/storefront build
```
