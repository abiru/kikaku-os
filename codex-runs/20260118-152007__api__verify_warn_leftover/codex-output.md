Updated `README.md` to explicitly name the publishable key env var so pk/sk placement is unambiguous; API routes already use `STRIPE_SECRET_KEY` with pk-guard rails, so no code changes were needed there, and storefront has no Stripe usage to rename.

```diff
diff --git a/README.md b/README.md
index 5cf7175..5e7b2d1 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ、`PUBLIC_STRIPE_PUBLISHABLE_KEY`）へ。
 
 ### Admin
 ```bash
```

```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
bash -lc 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"'
bash -lc 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"'
curl -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'
pnpm -C apps/api test
pnpm -C apps/storefront build
```

Tests not run here. If you want, I can also add a short note in `apps/api/.dev.vars.example` clarifying pk vs sk usage.
