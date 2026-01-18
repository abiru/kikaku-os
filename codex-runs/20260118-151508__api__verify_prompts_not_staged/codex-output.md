Updated README to explicitly name the publishable key env var so pk/sk placement is unambiguous; no code changes were needed because `STRIPE_SECRET_KEY` usage and pk_* guardrails already exist in `apps/api/src/routes/checkout.ts` and `apps/api/src/routes/dev.ts`. This keeps dev instructions aligned with Wrangler and avoids introducing storefront usage where none exists.

**Unified Diff**
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

**Verification Commands**
Commands 4–6 assume the API dev server is running with the specified `STRIPE_SECRET_KEY` (restart after changing it).
```bash
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
STRIPE_SECRET_KEY=pk_test_xxx curl -sS -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}' | rg -n "Stripe secret key looks like a publishable key" -
STRIPE_SECRET_KEY=sk_test_xxx curl -sS -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME" -H "content-type: application/json" | sed -n '1,80p'
curl -sS -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}' | sed -n '1,80p'
pnpm -C apps/api test
pnpm -C apps/storefront build
```

Note: I noticed pre-existing changes in `prompts/prompt.md` and an untracked `codex-runs/20260118-151508__api__verify_prompts_not_staged/`. Want me to leave those as-is?
