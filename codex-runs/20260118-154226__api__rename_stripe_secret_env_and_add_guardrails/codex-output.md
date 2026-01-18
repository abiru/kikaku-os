Clarified the Stripe env guidance so the pk/sk split and the 500 guardrail are explicit; API/runtime already uses `STRIPE_SECRET_KEY` with the pk_ guard so no code changes were needed.

- Updated `README.md` to document where sk_/pk_ go and the 500 behavior when `STRIPE_SECRET_KEY` is missing or pk_.

**Diff**
```diff
diff --git a/README.md b/README.md
index 5cf7175..afd35e9 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。
```

Commands 4–6 assume the API dev server is restarted after `.dev.vars` changes.

**Verification commands**
```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
perl -0777 -i -pe 's/^STRIPE_SECRET_KEY=.*/STRIPE_SECRET_KEY=pk_test_xxx/m' apps/api/.dev.vars && curl -s -i -X POST http://localhost:8787/checkout/session -H 'content-type: application/json' -d '{"variantId":1,"quantity":1}' | sed -n '1,12p'
perl -0777 -i -pe 's/^STRIPE_SECRET_KEY=.*/STRIPE_SECRET_KEY=sk_test_xxx/m' apps/api/.dev.vars && curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H 'x-admin-key: CHANGE_ME' | sed -n '1,12p'
curl -s -i -X POST http://localhost:8787/checkout/session -H 'content-type: application/json' -d '{"variantId":1,"quantity":1}' | sed -n '1,12p'
pnpm -C apps/api test
pnpm -C apps/storefront build
```
