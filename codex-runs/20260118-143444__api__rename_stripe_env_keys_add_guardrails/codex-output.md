Updated the README to explicitly name the storefront publishable key env var (`PUBLIC_STRIPE_PUBLISHABLE_KEY`) to reduce pk/sk confusion; API code already uses `STRIPE_SECRET_KEY` with the missing/pk* guardrails, so no code changes were needed there. The only change is the Stripe env note in `README.md` to clarify where the publishable key belongs.

**Unified Diff**
```diff
diff --git a/README.md b/README.md
index 5cf7175..4c9d1d4 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の `PUBLIC_STRIPE_PUBLISHABLE_KEY`（使う場合のみ）へ。
 
 ### Admin
 ```bash
```

**Verification Commands**
```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 & PK_API_PID=$!; sleep 2; curl -s -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'; kill $PK_API_PID
STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 & SK_API_PID=$!; sleep 2; curl -s -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"; kill $SK_API_PID
STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 & SK_API_PID=$!; sleep 2; curl -s -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'; kill $SK_API_PID
pnpm -C apps/api test
pnpm -C apps/storefront build
```

If you want me to adjust any docs or add a storefront publishable key guard once it’s used, say the word.
