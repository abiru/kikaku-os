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
