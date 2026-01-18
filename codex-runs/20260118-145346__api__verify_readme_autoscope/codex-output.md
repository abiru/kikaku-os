Clarified the Stripe env mapping in the local dev docs so pk/sk usage is explicit; API code already uses `STRIPE_SECRET_KEY` with guardrails, so no runtime changes were needed. Updated the Stripe guidance line in `README.md` to name `PUBLIC_STRIPE_PUBLISHABLE_KEY` for storefront when used, to reduce confusion.

```diff
diff --git a/README.md b/README.md
index 5cf7175..240cf18 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) を使う場合は `PUBLIC_STRIPE_PUBLISHABLE_KEY` を `apps/storefront/.env` に設定。
 
 ### Admin
 ```bash
```

Verification commands:
- `rg -n "STRIPE_API_KEY" apps/api apps/storefront || true`
- `rg -n "STRIPE_SECRET_KEY" apps/api`
- `cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars`
- ```bash
STRIPE_SECRET_KEY=pk_test_xxx ADMIN_API_KEY=CHANGE_ME DEV_MODE=true pnpm -C apps/api dev -- --port 8787 >/tmp/api-dev.log 2>&1 &
API_PID=$!
sleep 4
curl -sS -X POST http://localhost:8787/checkout/session \
  -H "content-type: application/json" \
  -d '{"variantId":1,"quantity":1}' | sed -n '1,200p'
kill $API_PID
```
- ```bash
STRIPE_SECRET_KEY=sk_test_xxx ADMIN_API_KEY=CHANGE_ME DEV_MODE=true pnpm -C apps/api dev -- --port 8787 >/tmp/api-dev.log 2>&1 &
API_PID=$!
sleep 4
curl -sS -X POST http://localhost:8787/dev/provision-stripe-prices \
  -H "x-admin-key: CHANGE_ME" | sed -n '1,200p'
kill $API_PID
```
- `curl -sS -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`

Tests not run here.

If you want, I can also add a short note in `apps/storefront/README.md` to mirror the publishable key name.
