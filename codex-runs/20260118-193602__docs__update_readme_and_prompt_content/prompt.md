You are an implementer.

Goal:
Finish repo hygiene + smoke stability, and make codex-run.sh robust so it never fails when the codex-runs output directory is missing.

Current situation:
- branch: main
- head: c13c206
- working tree changes:
  - README.md (local dev vars / Stripe note tweaks)
  - apps/api/package.json (smoke script curl quieting etc)
- untracked:
  - codex-runs/20260118-192805__api__rename_stripe_env_vars_and_guardrails/
- Recent issue: ./scripts/codex-run.sh can fail at the end with:
  "bundle-for-chatgpt.md: No such file or directory" when the run output dir is missing.

Constraints:
- Prefer minimal diffs; no refactors.
- Do NOT commit any secrets.
- Do NOT modify prompts/ or codex-runs/ content (including deleting/moving them).
- Keep runtime behavior unchanged:
  - API behavior unchanged (including pk* -> 500 STRIPE_SECRET_KEY_INVALID behavior).
  - Smoke still validates the intended 500 + STRIPE_SECRET_KEY_INVALID case.
- Must work on macOS default tools (bash 3.2, sed, perl, etc).
- Output: ONE unified diff patch + EXACTLY 10 copy/paste verification commands.

Tasks:
1) Repo hygiene
   - Ensure only intended files are modified after your changes.
   - Do not touch codex-runs/ or prompts/.
   - Keep README edits focused: clarify root `.dev.vars` is source-of-truth (next to wrangler.toml),
     and explicitly say `apps/api/.dev.vars.example` is reference-only (if needed).

2) Smoke script hardening (apps/api/package.json)
   - Keep current smoke logic and assertions.
   - Ensure it:
     - Fails early if PORT is already in use (already present).
     - Always restores ../../.dev.vars via trap (keep).
     - Does NOT print curl connection errors (choose ONE consistent approach):
       either `curl -sS ... 2>/dev/null` or `curl -s ...` (be consistent for both PING and CHECKOUT).
     - Avoid brittle quoting (keep tail -n 1 and sed '$d' usage).
   - Ensure no accidental spacing/typos inside the embedded script.

3) codex-run.sh robustness (scripts/codex-run.sh)
   - Before writing bundle-for-chatgpt.md (or any output under codex-runs/<run>/),
     ensure the parent directory exists: `mkdir -p "$(dirname "$BUNDLE_PATH")"`.
   - Keep the change minimal and safe; no behavior changes besides preventing the final write failure.
   - Do not introduce dependencies.

4) Commit message + stage plan
   - Produce a single commit for the intended changes (README + package.json + scripts/codex-run.sh).
   - Provide a clear commit message.

Output requirements:
- Provide ONE unified diff patch covering all your intended edits.
- Provide EXACTLY 10 verification commands, including:
  - pnpm -C apps/api test
  - pnpm -C apps/api smoke
  - node -p "require('./apps/api/package.json').scripts.dev"
  - node -p "require('./apps/api/package.json').scripts.smoke"
  - rg -n "Local API|.dev.vars.example|\\.dev\\.vars|8787|PORT=" README.md
  - ls -l .dev.vars.example && sed -n '1,80p' .dev.vars.example
  - git diff --stat
  - git status --short
  - git commit -m "<message>"   (do not run it)
  - git push                    (do not run it)

Do not ask questions. Make the safest choices.