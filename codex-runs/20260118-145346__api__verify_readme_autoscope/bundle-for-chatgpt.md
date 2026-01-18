# Codex run
- title: api: verify readme autoscope
- generated: 2026-01-18T14:57:57+09:00
- branch: main
- head: fe6875c

## Repo context
=== Codex Context (short) ===
2026-01-18T14:53:47+09:00

## Repo
branch: main
head:   fe6875c

## Status
## main...origin/main [ahead 1]
 M README.md
?? codex-runs/20260118-145346__api__verify_readme_autoscope/

## Changed files (HEAD..WT)
README.md

## Diff stats (HEAD..WT)
 README.md | 1 +
 1 file changed, 1 insertion(+)

## Recent commits
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
23f4331 codex-run: api: add dev endpoint for stripe prices
8257970 api: add dev endpoint for stripe prices
78b94ab storefront: fetch products from store api
b614e5e infra: ensure codex-run bundle is always generated
f2bc6eb chore: update codex prompt
e18f285 api: allow public GET access under /store

_(full context: codex-runs/20260118-145346__api__verify_readme_autoscope/context.txt)_

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

... (prompt truncated in bundle; full prompt: codex-runs/20260118-145346__api__verify_readme_autoscope/prompt.md)
```

## Codex output
```
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

... (output truncated in bundle; full output: codex-runs/20260118-145346__api__verify_readme_autoscope/codex-output.md)
```

