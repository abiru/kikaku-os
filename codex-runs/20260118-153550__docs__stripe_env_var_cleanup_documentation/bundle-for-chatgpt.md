# Codex run
- title: docs: stripe env var cleanup documentation
- generated: 2026-01-18T15:41:10+09:00
- branch: main
- head: 53a1269

## Repo context
=== Codex Context (short) ===
2026-01-18T15:35:50+09:00

## Repo
branch: main
head:   53a1269

## Status
## main...origin/main [ahead 7]
 M README.md
?? codex-runs/20260118-153550__docs__stripe_env_var_cleanup_documentation/

## Changed files (HEAD..WT)
README.md

## Diff stats (HEAD..WT)
 README.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

## Recent commits
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
83c8bec infra: auto commit work and codex runs

_(full context: codex-runs/20260118-153550__docs__stripe_env_var_cleanup_documentation/context.txt)_

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

... (prompt truncated in bundle; full prompt: codex-runs/20260118-153550__docs__stripe_env_var_cleanup_documentation/prompt.md)
```

## Codex output
```
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

... (output truncated in bundle; full output: codex-runs/20260118-153550__docs__stripe_env_var_cleanup_documentation/codex-output.md)
```

