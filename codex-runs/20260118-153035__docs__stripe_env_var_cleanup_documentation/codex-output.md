Updated the Stripe env-var note in `README.md` to explicitly map sk*/whsec* to `apps/api/.dev.vars` and clarify that Storefront doesn’t currently need a publishable key (with the future `PUBLIC_STRIPE_PUBLISHABLE_KEY` guidance). Confirmed `apps/admin/package.json` has no diff and left existing unrelated changes alone.

Tests run:
- `pnpm -C apps/admin test`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`

Git status still shows pre-existing changes in `prompts/prompt.md` and untracked `codex-runs/...`, plus the README change.

```diff
diff --git a/README.md b/README.md
index 5cf7175..0d84485 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う。
 
 ### Admin
 ```bash
```

Verification commands (8):
- `git status --short`
- `rg "STRIPE_API_KEY|STRIPE_SECRET_KEY" apps/api apps/storefront`
- `rg -n "Stripe:" README.md`
- `cat apps/api/.dev.vars.example`
- `pnpm -C apps/admin test`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`
- `git diff -- README.md`
