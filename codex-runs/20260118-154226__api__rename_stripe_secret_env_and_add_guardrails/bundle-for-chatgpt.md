# Codex run
- title: api: rename stripe secret env and add guardrails
- generated: 2026-01-18T15:48:05+09:00
- branch: main
- head: 2bc0550

## Repo context
=== Codex Context (short) ===
2026-01-18T15:42:31+09:00

## Repo
branch: main
head:   2bc0550

## Status
## main...origin/main [ahead 8]
 M README.md
?? codex-runs/20260118-154226__api__rename_stripe_secret_env_and_add_guardrails/

## Changed files (HEAD..WT)
README.md

## Diff stats (HEAD..WT)
 README.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

## Recent commits
2bc0550 codex-run: docs: stripe env var cleanup documentation
53a1269 codex-run: docs: stripe env var cleanup documentation
5142491 codex-run: api: rename stripe env var and guardrails
8edc87d codex-run: api: verify warn leftover
5d3560f codex-run: api: verify prompts not staged
29419dc codex-run: api: verify docs autoscope
bf0c775 codex-run: api: verify readme autoscope
fe6875c codex-run: api: rename stripe env keys add guardrails
475a7d2 chore: remove verification codex run from main
4d2ab3d Merge branch 'verify/no-commit-clean'
4ad2507 infra: make codex-run compatible with macOS bash 3.2
42534cb infra: make codex-run compatible with macOS bash 3.2
6dc4717 codex-run: api: verify only codex runs
303e125 chore: update codex prompt
11f22f1 codex-run: api: rename stripe env keys and add guards
a72e372 api: rename stripe env keys and add guards
abe3aaf codex-run: storefront: fetch products from store api
8aaecaa codex-run: infra: debug bundle missing
ef7a7bf codex-run: infra: add work commit flags and scope mapping
8cf6417 chore: update codex prompt

_(full context: codex-runs/20260118-154226__api__rename_stripe_secret_env_and_add_guardrails/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Eliminate Stripe key confusion by renaming env vars and adding guardrails so pk/sk cannot be mixed up.

Constraints:

- Keep behavior working in local dev.
- No secrets in repo.
- Keep changes minimal and explicit (no refactors).
- Output: unified diff + 8 verification commands.

Tasks:

1. API side:
   - Replace usage of c.env.STRIPE_API_KEY with c.env.STRIPE_SECRET_KEY in:
     - apps/api/src/routes/checkout.ts
     - apps/api/src/routes/dev.ts (provision-stripe-prices)
   - Add validation:
     - If STRIPE_SECRET_KEY missing -> return 500 "Stripe API key not configured" (keep message)
     - If STRIPE*SECRET_KEY starts with "pk*" -> return 500 with clear message (still safe for users)
2. Storefront side (only if currently needed):
   - If any Stripe publishable key is used in storefront, rename to PUBLIC*STRIPE_PUBLISHABLE_KEY and validate it starts with "pk*".
   - If storefront doesn’t use it, do not add new usage.
3. Add example env files (no real keys):
   - apps/api/.dev.vars.example (or similar, follow existing conventions)
   - apps/storefront/.env.example (if storefront expects PUBLIC_API_BASE or similar)
   - Root README update (very small) showing which key goes where.
4. Ensure dev instructions still match wrangler usage.

Verification commands (must be copy/paste ready):

- rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
- rg -n "STRIPE_SECRET_KEY" apps/api
- cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
- (set wrong key) STRIPE_SECRET_KEY=pk_test_xxx ... verify endpoint returns 500 with message
- (set correct key) STRIPE_SECRET_KEY=sk_test_xxx ... verify /dev/provision-stripe-prices works with x-admin-key
- curl checkout/session returns 200 (or expected next error if missing provider_price_id)
- pnpm -C apps/api test (if exists)
- pnpm -C apps/storefront build

Keep output compact.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-154226__api__rename_stripe_secret_env_and_add_guardrails/prompt.md)
```

## Codex output
```
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

... (output truncated in bundle; full output: codex-runs/20260118-154226__api__rename_stripe_secret_env_and_add_guardrails/codex-output.md)
```

