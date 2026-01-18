You are an implementer.

Goal:
Add a one-command local smoke test for the API that:

- boots wrangler dev (local)
- verifies .dev.vars is loaded from repo root
- hits a lightweight endpoint (ping/health)
- verifies Stripe guardrails + checkout happy path are at least actionable
- shuts down the server reliably

Context:

- wrangler.toml is at repo root
- .dev.vars is expected at repo root
- apps/api dev script is now: wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}
- Checkout/session works when Stripe/D1 are configured, and returns structured errors otherwise.

Constraints:

- Minimal, explicit changes. No refactors.
- No secrets committed.
- Do NOT edit prompts/ or scripts/.
- Keep behavior unchanged; only add dev ergonomics + tests.
- Must work on macOS (bash/zsh) and CI Linux.
- Output: unified diff patch + 8 verification commands.

Tasks:

1. Add a lightweight endpoint for smoke checks

- If a lightweight endpoint already exists, reuse it.
- Otherwise add `GET /dev/ping` in apps/api/src/routes/dev.ts that returns:
  { ok: true, name: "kikaku-os-api", time: <iso>, dev_mode: <bool> }
- The endpoint must NOT require ADMIN_API_KEY.

2. Add a new npm script in apps/api/package.json

- Add `smoke` script that:
  - starts the API on PORT (default 8787)
  - waits briefly
  - curls `/dev/ping` and prints status+body
  - curls `/checkout/session` with a deliberately bad STRIPE_SECRET_KEY=pk_test_xxx and confirms:
    - status 500
    - error.code == "STRIPE_SECRET_KEY_INVALID"
  - (optional but nice) curls `/checkout/session` with current env and prints only status+first 120 chars
  - kills the server even if curl fails
- Keep it as a single command users can run: `pnpm -C apps/api smoke`
- Implementation must not depend on external tools beyond sh, curl, sed, grep.

3. Tests

- Add/extend vitest tests to cover `/dev/ping` response shape and that it does not require admin key.
- Keep tests minimal.

Output:

- Provide a single unified diff patch.
- Provide 8 copy/paste verification commands including:
  1. pnpm -C apps/api test
  2. pnpm -C apps/api smoke
  3. PORT=8789 pnpm -C apps/api smoke
  4. rg -n "dev/ping" apps/api/src/routes/dev.ts apps/api/src/routes/dev.test.ts
  5. node -p "require('./apps/api/package.json').scripts.smoke"
  6. git diff --stat
  7. git status --short
  8. (optional) show README snippet if you add one line about the smoke script

Do not ask questions. If something is ambiguous, choose the safest minimal behavior.
