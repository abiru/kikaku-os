# Codex run
- title: docs: stripe env var cleanup documentation
- generated: 2026-01-18T15:32:58+09:00
- branch: main
- head: 5142491

## Repo context
=== Codex Context (short) ===
2026-01-18T15:30:39+09:00

## Repo
branch: main
head:   5142491

## Status
## main...origin/main [ahead 6]
 M README.md
 M prompts/prompt.md
?? codex-runs/20260118-153035__docs__stripe_env_var_cleanup_documentation/

## Changed files (HEAD..WT)
README.md
prompts/prompt.md

## Diff stats (HEAD..WT)
 README.md         |  2 +-
 prompts/prompt.md | 67 ++++++++++++++++++++++++++++---------------------------
 2 files changed, 35 insertions(+), 34 deletions(-)

## Recent commits
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
23f4331 codex-run: api: add dev endpoint for stripe prices

_(full context: codex-runs/20260118-153035__docs__stripe_env_var_cleanup_documentation/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Finish the Stripe env-var cleanup and documentation so local dev cannot mix pk/sk keys.

Current state:

- API uses STRIPE_SECRET_KEY with guardrails in checkout/dev endpoints.
- apps/api/.dev.vars.example exists.
- apps/storefront/.env.example exists with PUBLIC_API_BASE.
- Root README has a Stripe note.
- There is a stray whitespace-only change in apps/admin/package.json that must NOT be committed.

Constraints:

- Keep changes minimal and explicit. No refactors.
- No real secrets committed.
- Do not modify admin app files. Do not commit whitespace-only changes.

Tasks:

1. Ensure repo is clean from unrelated changes:
   - Revert apps/admin/package.json if it only contains trailing whitespace/newline changes.
2. Ensure documentation is consistent:
   - Root README must clearly state:
     - STRIPE*SECRET_KEY (sk*\*) goes to apps/api/.dev.vars
     - STRIPE*WEBHOOK_SECRET (whsec*\*) goes to apps/api/.dev.vars (only needed for webhook route)
     - Storefront does NOT currently require a Stripe publishable key; if needed in the future, use PUBLIC*STRIPE_PUBLISHABLE_KEY (pk*\*) in storefront env.
3. Ensure no leftover STRIPE_API_KEY usage anywhere in apps/api or apps/storefront.
4. Output:
   - unified diff patch
   - 8 copy/paste verification commands (include git status checks and rg checks).

Verification commands must include:

- rg for STRIPE_API_KEY/STRIPE_SECRET_KEY
- show README Stripe lines
- show apps/api/.dev.vars.example contents
- run pnpm -C apps/api test
- run pnpm -C apps/storefront build
- confirm git status is clean except codex-runs/ if generated

Do not ask questions. If something is ambiguous, choose the safest minimal action.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-153035__docs__stripe_env_var_cleanup_documentation/prompt.md)
```

## Codex output
```
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

... (output truncated in bundle; full output: codex-runs/20260118-153035__docs__stripe_env_var_cleanup_documentation/codex-output.md)
```

