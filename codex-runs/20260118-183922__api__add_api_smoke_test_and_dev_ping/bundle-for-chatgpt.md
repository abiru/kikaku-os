# Codex run
- title: api: add api smoke test and dev ping
- generated: 2026-01-18T18:49:19+09:00
- branch: main
- head: d40fee5

## Repo context
=== Codex Context (short) ===
2026-01-18T18:39:30+09:00

## Repo
branch: main
head:   d40fee5

## Status
## main...origin/main
 M prompts/prompt.md
?? codex-runs/20260118-183922__api__add_api_smoke_test_and_dev_ping/

## Changed files (HEAD..WT)
prompts/prompt.md

## Diff stats (HEAD..WT)
 prompts/prompt.md | 93 +++++++++++++++++++++++++++++++++++--------------------
 1 file changed, 60 insertions(+), 33 deletions(-)

## Recent commits
d40fee5 codex-run: api: clarify local dev vars and port
fd86786 api: clarify local dev vars and port
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

_(full context: codex-runs/20260118-183922__api__add_api_smoke_test_and_dev_ping/context.txt)_

## Prompt (what I gave to codex)
```
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

... (prompt truncated in bundle; full prompt: codex-runs/20260118-183922__api__add_api_smoke_test_and_dev_ping/prompt.md)
```

## Codex output
```
Added a public `/dev/ping` endpoint and a one-command smoke script to validate local `.dev.vars` + Stripe guardrails, plus a minimal test that asserts the ping is public and well-shaped.  
Heads up: I see unrelated changes in `prompts/prompt.md` and untracked `codex-runs/20260118-183922__api__add_api_smoke_test_and_dev_ping/` in the working tree that I did not touch. How would you like to handle those?

- `apps/api/src/routes/dev.ts`: add `GET /dev/ping` returning ok/name/time/dev_mode for smoke checks.
- `apps/api/src/index.ts`: allow unauthenticated `GET /dev/ping` to bypass admin key middleware.
- `apps/api/src/routes/dev.test.ts`: add a worker-level ping test that confirms no admin key required and validates payload shape.
- `apps/api/package.json`: add `smoke` script to boot dev server, check ping/dev_mode, validate Stripe key guardrail, and always tear down.

```diff
diff --git a/apps/api/package.json b/apps/api/package.json
index 213a412..a0a7e6d 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -7,7 +7,8 @@
   "scripts": {
     "dev": "wrangler dev --local --config ../../wrangler.toml --port ${PORT:-8787}",
     "build": "wrangler build",
-    "test": "vitest run"
+    "test": "vitest run",
+    "smoke": "sh -c 'set -e; PORT=${PORT:-8787}; LOG=\"/tmp/kikaku-os-api-smoke-$PORT-$$.log\"; cleanup(){ if [ -n \"${PID:-}\" ]; then kill \"$PID\" 2>/dev/null || true; wait \"$PID\" 2>/dev/null || true; fi; }; trap cleanup EXIT INT TERM; STRIPE_SECRET_KEY=pk_test_xxx PORT=\"$PORT\" pnpm dev -- --var STRIPE_SECRET_KEY=pk_test_xxx >\"$LOG\" 2>&1 & PID=$!; PING=$(curl -sS --retry 20 --retry-delay 1 --retry-connrefused -w \"\\n%{http_code}\" \"http://127.0.0.1:$PORT/dev/ping\"); PING_STATUS=$(printf \"%s\\n\" \"$PING\" | sed -n \"\\$p\"); PING_BODY=$(printf \"%s\\n\" \"$PING\" | sed \"\\$d\"); printf \"GET /dev/ping -> %s %s\\n\" \"$PING_STATUS\" \"$PING_BODY\"; [ \"$PING_STATUS\" = \"200\" ]; printf \"%s\" \"$PING_BODY\" | grep -q \"\\\"dev_mode\\\":true\"; printf \"%s\" \"$PING_BODY\" | grep -q \"\\\"name\\\":\\\"kikaku-os-api\\\"\"; CHECKOUT=$(curl -sS -w \"\\n%{http_code}\" -H \"content-type: application/json\" -d \"{\\\"variantId\\\":1,\\\"quantity\\\":1}\" \"http://127.0.0.1:$PORT/checkout/session\"); CHECKOUT_STATUS=$(printf \"%s\\n\" \"$CHECKOUT\" | sed -n \"\\$p\"); CHECKOUT_BODY=$(printf \"%s\\n\" \"$CHECKOUT\" | sed \"\\$d\"); printf \"POST /checkout/session -> %s %s\\n\" \"$CHECKOUT_STATUS\" \"$CHECKOUT_BODY\"; [ \"$CHECKOUT_STATUS\" = \"500\" ]; printf \"%s\" \"$CHECKOUT_BODY\" | grep -q \"\\\"code\\\":\\\"STRIPE_SECRET_KEY_INVALID\\\"\"'"
   },
   "dependencies": {
     "hono": "^4.5.0"
diff --git a/apps/api/src/index.ts b/apps/api/src/index.ts
index cd4ce0d..814492f 100644
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@ -46,6 +46,7 @@ app.use('*', async (c, next) => {
   if (c.req.method === 'OPTIONS') return c.body(null, 204);
   if (c.req.path.startsWith('/webhooks/stripe')) return next();
   if (c.req.path.startsWith('/checkout/session')) return next();
+  if (c.req.method === 'GET' && c.req.path === '/dev/ping') return next();
   if (
     c.req.method === 'GET' &&
     (c.req.path === '/store' || c.req.path.startsWith('/store/'))
diff --git a/apps/api/src/routes/dev.test.ts b/apps/api/src/routes/dev.test.ts
index 1cc94c8..df35254 100644
--- a/apps/api/src/routes/dev.test.ts
+++ b/apps/api/src/routes/dev.test.ts
@@ -1,6 +1,7 @@
 import { describe, it, expect, vi } from 'vitest';
 import { Hono } from 'hono';
 import dev from './dev';
+import worker from '../index';
 
 type StripeProvisionRow = {
   variant_id: number;
@@ -56,6 +57,27 @@ const createMockDb = (options: {
   };
 };
 
+describe('GET /dev/ping', () => {
+  it('returns a public ping payload without admin key', async () => {
+    const res = await worker.fetch(
+      new Request('http://localhost/dev/ping'),
+      { DEV_MODE: 'true' } as any,
+      {
+        waitUntil: () => {},
+        passThroughOnException: () => {}
+      } as any
+    );
+
+    expect(res.status).toBe(200);
+    const json = await res.json<any>();
+    expect(json.ok).toBe(true);
+    expect(json.name).toBe('kikaku-os-api');
+    expect(json.dev_mode).toBe(true);
+    expect(typeof json.time).toBe('string');
+    expect(Number.isNaN(Date.parse(json.time))).toBe(false);
+  });
+});
+
 describe('POST /dev/provision-stripe-prices', () => {
   it('provisions prices with missing provider_price_id', async () => {
     const app = new Hono();
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index 8646112..6a2f0fd 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -33,6 +33,14 @@ const randInt = (min: number, max: number) => {
   return Math.floor(Math.random() * (max - min + 1)) + min;
 };
 
+dev.get('/ping', (c) => {
+  return jsonOk(c, {
+    name: 'kikaku-os-api',
+    time: new Date().toISOString(),
+    dev_mode: c.env.DEV_MODE === 'true'
+  });
+});
+
 dev.post('/seed', async (c) => {
   if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);
 
```

Verification commands:
```sh
pnpm -C apps/api test
pnpm -C apps/api smoke
PORT=8789 pnpm -C apps/api smoke
rg -n "dev/ping" apps/api/src/routes/dev.ts apps/api/src/routes/dev.test.ts
node -p "require('./apps/api/package.json').scripts.smoke"
git diff --stat
git status --short
rg -n "smoke" README.md || true
```

If you want, I can also add the optional "current env" checkout call to the smoke script.

... (output truncated in bundle; full output: codex-runs/20260118-183922__api__add_api_smoke_test_and_dev_ping/codex-output.md)
```

