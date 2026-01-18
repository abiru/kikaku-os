# Codex run
- title: api: verify docs autoscope
- generated: 2026-01-18T15:01:14+09:00
- branch: main
- head: bf0c775

## Repo context
=== Codex Context (short) ===
2026-01-18T14:58:41+09:00

## Repo
branch: main
head:   bf0c775

## Status
## main...origin/main [ahead 2]
?? codex-runs/20260118-145841__api__verify_docs_autoscope/
?? docs/

## Changed files (HEAD..WT)

## Diff stats (HEAD..WT)

## Recent commits
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
23f4331 codex-run: api: add dev endpoint for stripe prices
8257970 api: add dev endpoint for stripe prices
78b94ab storefront: fetch products from store api
b614e5e infra: ensure codex-run bundle is always generated
f2bc6eb chore: update codex prompt

_(full context: codex-runs/20260118-145841__api__verify_docs_autoscope/context.txt)_

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

... (prompt truncated in bundle; full prompt: codex-runs/20260118-145841__api__verify_docs_autoscope/prompt.md)
```

## Codex output
```
No code changes needed; `apps/api/src/routes/checkout.ts` and `apps/api/src/routes/dev.ts` already use `STRIPE_SECRET_KEY` with pk-guardrails, and env examples plus `README.md` already document the correct key placement. Storefront has no Stripe publishable key usage, so there’s nothing to rename there.

**Diff**
```diff
(no changes required)
```

**Verification Commands**
- `rg -n "STRIPE_API_KEY" apps/api apps/storefront || true`
- `rg -n "STRIPE_SECRET_KEY" apps/api`
- `cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars`
- `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; sleep 2; curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"; kill $pid'`
- `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; sleep 2; curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"; kill $pid'`
- `curl -s -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`

... (output truncated in bundle; full output: codex-runs/20260118-145841__api__verify_docs_autoscope/codex-output.md)
```

