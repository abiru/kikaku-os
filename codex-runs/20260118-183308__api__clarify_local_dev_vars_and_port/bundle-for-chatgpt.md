# Codex run
- title: api: clarify local dev vars and port
- generated: 2026-01-18T18:36:31+09:00
- branch: main
- head: 6b2bb05

## Repo context
=== Codex Context (short) ===
2026-01-18T18:33:14+09:00

## Repo
branch: main
head:   6b2bb05

## Status
## main...origin/main
 M prompts/prompt.md
?? codex-runs/20260118-183308__api__clarify_local_dev_vars_and_port/

## Changed files (HEAD..WT)
prompts/prompt.md

## Diff stats (HEAD..WT)
 prompts/prompt.md | 91 ++++++++++++++++++++++++++++++++++++-------------------
 1 file changed, 59 insertions(+), 32 deletions(-)

## Recent commits
6b2bb05 codex-run: api: fix d1 mock shape in dev tests
ad37272 api: fix d1 mock shape in dev tests
4ca6aee codex-run: api: fix stripe price provisioning and lookup
67244da api: fix stripe price provisioning and lookup
5598791 api: checkout session stripe error handling
f92fade codex-run: api: checkout session stripe error handling
b45a9b7 api: checkout session stripe error handling
c160396 docs: clarify stripe env vars and guardrails
4d140ae codex-run: api: rename stripe secret env and add guardrails
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

_(full context: codex-runs/20260118-183308__api__clarify_local_dev_vars_and_port/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Remove local-dev confusion around where `.dev.vars` is read from and which port the API actually listens on.
Make local dev predictable: root wrangler.toml + root .dev.vars + fixed port 8787.

Context:

- `wrangler.toml` exists at repo root.
- When running `pnpm -C apps/api dev`, wrangler logs show: "Using vars defined in ../../.dev.vars".
- We previously edited `apps/api/.dev.vars` sometimes, but wrangler actually reads root `.dev.vars`.
- Sometimes wrangler prints Ready on 8788 even when we expect 8787, causing confusion.

Constraints:

- Minimal, explicit changes. No refactors.
- No secrets committed.
- Do NOT touch `prompts/` or `scripts/`.
- Keep existing runtime behavior. Only improve dev ergonomics and docs.
- Output: unified diff + 8 verification commands.

Tasks:

1. Standardize `.dev.vars` location (root)

- Add a root `.dev.vars.example` (no real keys) that matches what API expects:
  - ADMIN_API_KEY
  - DEV_MODE
  - STOREFRONT_BASE_URL
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
- Update README (tiny) to say:
  - `.dev.vars` must be at repo root next to `wrangler.toml`
  - `pnpm -C apps/api dev` reads vars from `../../.dev.vars`
  - How to set Stripe keys (sk*/whsec*) safely

(If `apps/api/.dev.vars.example` exists, keep it but make it clear root is the source-of-truth; do not remove files unless necessary.)

2. Make `apps/api` dev script unambiguous about port/config

- In `apps/api/package.json`:
  - Update `scripts.dev` to pass port/config in a way wrangler actually understands.
  - Ensure it uses the root config explicitly (so there is no ambiguity about which `wrangler.toml` is used).
  - Keep default port 8787, but allow overriding via env `PORT` if easy without adding deps.

Example target (adjust if needed):
`wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}`

3. Docs: one concise "Local API" snippet

- In README, add 3–6 lines max:
  - `cp .dev.vars.example .dev.vars`
  - `pnpm -C apps/api dev`
  - API URL is `http://localhost:8787` (and note: if port is busy, change `PORT=...`)

Output requirements:

- Provide one unified diff patch.
- Provide 8 copy/paste verification commands:
  1. show where `.dev.vars` is read from (run dev and grep the log line)
  2. print the dev script value from package.json
  3. confirm `.dev.vars.example` exists at root and show first 40 lines
  4. start API on 8787 and curl `/health` or a lightweight endpoint (use `/dev/ping` if exists; otherwise just hit `/` and show headers)
  5. start API on alternate port (PORT=8789) and curl it
  6. rg for `.dev.vars.example` references in README
  7. pnpm -C apps/api test
  8. git status --short

Do not ask questions; choose the safest minimal changes.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-183308__api__clarify_local_dev_vars_and_port/prompt.md)
```

## Codex output
```
Updated the API dev script to explicitly use the root `wrangler.toml` and a predictable port (with optional `PORT` override), added a root `.dev.vars.example`, and tightened README guidance so the root `.dev.vars` is the source-of-truth and the Local API steps are unambiguous.

```diff
diff --git a/.dev.vars.example b/.dev.vars.example
new file mode 100644
index 0000000..dada717
--- /dev/null
+++ b/.dev.vars.example
@@ -0,0 +1,5 @@
+ADMIN_API_KEY=CHANGE_ME
+DEV_MODE=true
+STOREFRONT_BASE_URL=http://localhost:4321
+STRIPE_SECRET_KEY=sk_test_replace
+STRIPE_WEBHOOK_SECRET=whsec_replace
diff --git a/README.md b/README.md
index 706dbe6..946be45 100644
--- a/README.md
+++ b/README.md
@@ -13,7 +13,7 @@
 依存は pnpm を推奨します。
 
 ### 共通
-- 環境変数: `ADMIN_API_KEY` を wrangler.toml に設定
+- 環境変数: `ADMIN_API_KEY` などは repo root の `.dev.vars`（`wrangler.toml` の隣）に設定
 - API: http://localhost:8787
 - Admin: http://localhost:5173
 - Storefront: http://localhost:4321
@@ -21,16 +21,24 @@
 - ローカルseed: `DEV_MODE=true` のときのみ `/dev/seed` が有効
 
 ### API
+#### Local API
+```bash
+cp .dev.vars.example .dev.vars
+pnpm -C apps/api dev
+# API: http://localhost:8787 (busy? PORT=8789 pnpm -C apps/api dev)
+```
+`pnpm -C apps/api dev` は `../../.dev.vars` を読む（source of truth は repo root）。
+
 ```bash
 pnpm install --prefix apps/api
-# .dev.vars.example を .dev.vars にコピーして編集（APIキー等）
-cp apps/api/.dev.vars.example apps/api/.dev.vars
-pnpm -C apps/api dev -- --port 8787
+# .dev.vars.example を repo root の .dev.vars にコピーして編集（APIキー等）
+cp .dev.vars.example .dev.vars
+pnpm -C apps/api dev
 
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
+Stripe: `STRIPE_SECRET_KEY`(sk*) と `STRIPE_WEBHOOK_SECRET`(whsec*) は repo root の `.dev.vars` に設定（`.dev.vars` はローカル管理でコミットしない）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
diff --git a/apps/api/package.json b/apps/api/package.json
index 00cbf53..213a412 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -5,7 +5,7 @@
   "module": "esnext",
   "type": "module",
   "scripts": {
-    "dev": "wrangler dev --local",
+    "dev": "wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}",
     "build": "wrangler build",
     "test": "vitest run"
   },
```

Verification commands:
1. `pnpm -C apps/api dev 2>&1 | rg -m 1 "Using vars defined in"`
2. `node -p "require('./apps/api/package.json').scripts.dev"`
3. `ls -l .dev.vars.example && sed -n '1,40p' .dev.vars.example`
4. `PORT=8787 pnpm -C apps/api dev > /tmp/api-dev-8787.log 2>&1 & API_PID=$!; sleep 2; (curl -sS -D - http://localhost:8787/dev/ping -o /dev/null || curl -I http://localhost:8787/); kill $API_PID`
5. `PORT=8789 pnpm -C apps/api dev > /tmp/api-dev-8789.log 2>&1 & API_PID=$!; sleep 2; (curl -sS -D - http://localhost:8789/dev/ping -o /dev/null || curl -I http://localhost:8789/); kill $API_PID`
6. `rg -n ".dev.vars.example" README.md`
7. `pnpm -C apps/api test`
8. `git status --short`

I noticed pre-existing changes in `prompts/prompt.md` that I did not make; should I ignore those and proceed?

... (output truncated in bundle; full output: codex-runs/20260118-183308__api__clarify_local_dev_vars_and_port/codex-output.md)
```

