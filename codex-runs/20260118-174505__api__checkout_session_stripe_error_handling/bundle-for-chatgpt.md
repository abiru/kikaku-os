# Codex run
- title: api: checkout session stripe error handling
- generated: 2026-01-18T17:51:16+09:00
- branch: main
- head: c160396

## Repo context
=== Codex Context (short) ===
2026-01-18T17:45:12+09:00

## Repo
branch: main
head:   c160396

## Status
## main...origin/main
 M prompts/prompt.md
?? codex-runs/20260118-174505__api__checkout_session_stripe_error_handling/

## Changed files (HEAD..WT)
prompts/prompt.md

## Diff stats (HEAD..WT)
 prompts/prompt.md | 103 +++++++++++++++++++++++++++++++++++++-----------------
 1 file changed, 71 insertions(+), 32 deletions(-)

## Recent commits
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
42534cb infra: make codex-run compatible with macOS bash 3.2
6dc4717 codex-run: api: verify only codex runs
303e125 chore: update codex prompt
11f22f1 codex-run: api: rename stripe env keys and add guards
a72e372 api: rename stripe env keys and add guards
abe3aaf codex-run: storefront: fetch products from store api
8aaecaa codex-run: infra: debug bundle missing

_(full context: codex-runs/20260118-174505__api__checkout_session_stripe_error_handling/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Make the checkout flow E2E-verifiable and “actionable” when it fails.
Specifically, /checkout/session must return clear, user-safe, next-step error messages for the common misconfigs:

- Stripe secret key missing
- Stripe secret key accidentally set to pk\_\*
- Stripe price not configured for a variant (provider_price_id missing/null or not found)

Constraints:

- Keep changes minimal and explicit (no refactors).
- No secrets committed.
- Keep local dev behavior working with wrangler dev --local.
- Do not touch prompts/ or scripts/ (except via codex-run; but do NOT edit scripts/ in this task).
- Output: unified diff + 10 verification commands.
- Add/adjust tests if they exist; prefer vitest in apps/api.

Repo context:
This repo already has STRIPE_SECRET_KEY guardrails in API routes, and D1 stores variant/provider_price_id.
There was an observed runtime error: "Stripe price not configured for this variant".

Tasks:

1. API: /checkout/session error clarity

- In apps/api/src/routes/checkout.ts:
  - Ensure missing STRIPE_SECRET_KEY returns 500 with message exactly "Stripe API key not configured" (already required).
  - Ensure STRIPE_SECRET_KEY that starts with "pk" returns 500 with a clear but user-safe message (no key echo).
  - If the requested variant has no configured Stripe price id (provider_price_id is null/empty OR the DB row missing):
    - Return 400 with a clear message:
      "Stripe price not configured for this variant"
    - Include a machine-friendly error code in JSON, e.g. { ok:false, error:{ code:"STRIPE_PRICE_NOT_CONFIGURED", message:"..." } }
    - Do NOT leak internal IDs besides variant_id; do not include DB schema details.
  - If the variant_id is invalid / not found:
    - Return 404 with code "VARIANT_NOT_FOUND" and a clear message.
  - Keep the happy path unchanged.

2. API: dev provisioning endpoint alignment

- In apps/api/src/routes/dev.ts (provision-stripe-prices):
  - Ensure it uses STRIPE*SECRET_KEY and has the same pk* guardrail behavior (if not already).
  - Make its response include which variants were updated and how many were skipped due to missing mapping, but keep it concise.

3. Tests

- In apps/api/src/routes/checkout.test.ts (or create if missing):
  - Add tests for:
    a) missing STRIPE_SECRET_KEY => 500 + message "Stripe API key not configured"
    b) STRIPE_SECRET_KEY=pk_test_xxx => 500 + message includes "publishable key" (or equivalent) and code "STRIPE_SECRET_KEY_INVALID"
    c) provider_price_id null => 400 + message "Stripe price not configured for this variant" + code "STRIPE_PRICE_NOT_CONFIGURED"
    d) variant not found => 404 + code "VARIANT_NOT_FOUND"
  - Keep mocks minimal; do not rewrite existing test helpers.

4. Documentation (tiny)

- Update README.md (1–3 lines max) to mention:
  - If checkout returns STRIPE_PRICE_NOT_CONFIGURED, run /dev/provision-stripe-prices in dev and ensure variant has provider_price_id.
  - Do not add new sections.

Output requirements:

- Provide a single unified diff patch.
- Provide 10 copy/paste verification commands:
  1. rg STRIPE_API_KEY usage (should be none)
  2. rg STRIPE_SECRET_KEY usage in apps/api
  3. show the checkout route key guard section (sed -n)
  4. run pnpm -C apps/api test
  5. run pnpm -C apps/storefront build
  6. start API with STRIPE_SECRET_KEY=pk_test_xxx and curl /checkout/session shows 500 + message
  7. start API with STRIPE_SECRET_KEY=sk_test_xxx and curl /checkout/session with an unmapped variant shows 400 STRIPE_PRICE_NOT_CONFIGURED
  8. curl /checkout/session with non-existent variant shows 404 VARIANT_NOT_FOUND
  9. curl /dev/provision-stripe-prices with x-admin-key and show response (even if it errors due to Stripe test key)
  10. git status --short (clean except codex-runs if generated)

Notes:

- Assume shell is zsh.
- Commands that start servers must background them, sleep briefly, curl, then kill the PID, all in one command.
- Do not ask questions; choose the safest minimal implementation.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-174505__api__checkout_session_stripe_error_handling/prompt.md)
```

## Codex output
```
Added structured, user-safe error responses for checkout misconfigs while keeping the missing-key message intact; distinguished variant-not-found vs price-not-configured with a small existence check; and made dev provisioning report missing-mapping skips. Updated checkout tests for the new error codes/messages and added a one-line README hint for STRIPE_PRICE_NOT_CONFIGURED in local dev. Changes are in `apps/api/src/routes/checkout.ts`, `apps/api/src/routes/dev.ts`, `apps/api/src/routes/checkout.test.ts`, and `README.md`.

I noticed `prompts/prompt.md` is already modified in the worktree even though I didn’t touch it. Do you want me to ignore it or include it in the patch output?

```diff
diff --git a/README.md b/README.md
index afd35e9..706dbe6 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
 
 ### Admin
 ```bash
diff --git a/apps/api/src/routes/checkout.test.ts b/apps/api/src/routes/checkout.test.ts
index a37802d..448c733 100644
--- a/apps/api/src/routes/checkout.test.ts
+++ b/apps/api/src/routes/checkout.test.ts
@@ -2,9 +2,13 @@ import { describe, it, expect, vi } from 'vitest';
 import { Hono } from 'hono';
 import checkout from './checkout';
 
-const createMockDb = (steps: string[], variantOverride?: Partial<Record<string, unknown>>) => {
+const createMockDb = (
+  steps: string[],
+  variantOverride?: Partial<Record<string, unknown>> | null,
+  variantExists = true
+) => {
   const calls: { sql: string; bind: unknown[] }[] = [];
-  const variantRow = {
+  const baseVariantRow = {
     variant_id: 10,
     variant_title: 'Standard',
     product_id: 1,
@@ -13,16 +17,20 @@ const createMockDb = (steps: string[], variantOverride?: Partial<Record<string,
     amount: 1200,
     currency: 'jpy',
     provider_price_id: 'price_test_123',
-    ...variantOverride
   };
+  const variantRow = variantOverride === null ? null : { ...baseVariantRow, ...variantOverride };
+  const variantId = (variantRow?.variant_id ?? baseVariantRow.variant_id) as number;
   return {
     calls,
     prepare: (sql: string) => ({
       bind: (...args: unknown[]) => ({
         first: async () => {
-          if (sql.includes('FROM variants')) {
+          if (sql.includes('FROM variants v')) {
             return variantRow;
           }
+          if (sql.includes('FROM variants WHERE')) {
+            return variantExists ? { id: variantId } : null;
+          }
           if (sql.includes('FROM customers')) {
             return null;
           }
@@ -152,6 +160,8 @@ describe('POST /checkout/session', () => {
     const json = await res.json();
     expect(res.status).toBe(400);
     expect(json.ok).toBe(false);
+    expect(json.error?.code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
+    expect(json.error?.message).toBe('Stripe price not configured for this variant');
     expect(fetchMock).not.toHaveBeenCalled();
   });
 
@@ -208,7 +218,39 @@ describe('POST /checkout/session', () => {
 
     const json = await res.json();
     expect(res.status).toBe(500);
-    expect(json.message).toMatch('Stripe secret key looks like a publishable key');
+    expect(json.message).toContain('publishable key');
+    expect(json.error?.code).toBe('STRIPE_SECRET_KEY_INVALID');
+    expect(json.error?.message).toContain('publishable key');
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it('rejects unknown variant', async () => {
+    const app = new Hono();
+    app.route('/', checkout);
+
+    const fetchMock = vi.fn();
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const env = {
+      DB: createMockDb([], null, false),
+      STRIPE_SECRET_KEY: 'sk_test_123',
+      STOREFRONT_BASE_URL: 'http://localhost:4321'
+    } as any;
+
+    const res = await app.request(
+      'http://localhost/checkout/session',
+      {
+        method: 'POST',
+        headers: { 'content-type': 'application/json' },
+        body: JSON.stringify({ variantId: 999, quantity: 1 })
+      },
+      env
+    );
+
+    const json = await res.json();
+    expect(res.status).toBe(404);
+    expect(json.error?.code).toBe('VARIANT_NOT_FOUND');
+    expect(json.error?.message).toBe('Variant not found');
     expect(fetchMock).not.toHaveBeenCalled();
   });
 });
diff --git a/apps/api/src/routes/checkout.ts b/apps/api/src/routes/checkout.ts
index fad697d..d01ccdf 100644
--- a/apps/api/src/routes/checkout.ts
+++ b/apps/api/src/routes/checkout.ts
@@ -1,4 +1,5 @@
 import { Hono } from 'hono';
+import type { Context } from 'hono';
 import type { Env } from '../env';
 import { jsonError, jsonOk } from '../lib/http';
 
@@ -26,12 +27,18 @@ const isValidEmail = (value: string) => {
   return value.includes('@');
 };
 
+const jsonErrorWithCode = (c: Context, code: string, message: string, status = 500) => {
+  console.error(message);
+  return c.json({ ok: false, message, error: { code, message } }, status);
+};
+
 checkout.post('/checkout/session', async (c) => {
   const stripeKey = c.env.STRIPE_SECRET_KEY;
   if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
   if (stripeKey.startsWith('pk_')) {
-    return jsonError(
+    return jsonErrorWithCode(
       c,
+      'STRIPE_SECRET_KEY_INVALID',
       'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
       500
     );
@@ -75,9 +82,29 @@ checkout.post('/checkout/session', async (c) => {
      LIMIT 1`
   ).bind(variantId).first<VariantPriceRow>();
 
-  if (!variantRow) return jsonError(c, 'Variant not found', 404);

... (truncated: codex-runs/20260118-174505__api__checkout_session_stripe_error_handling/codex-output.md has 226 lines; showing head 146 + tail 74)

+    if (!variantExists) {
+      return jsonErrorWithCode(c, 'VARIANT_NOT_FOUND', 'Variant not found', 404);
+    }
+    return jsonErrorWithCode(
+      c,
+      'STRIPE_PRICE_NOT_CONFIGURED',
+      'Stripe price not configured for this variant',
+      400
+    );
+  }
+
+  const providerPriceId = variantRow.provider_price_id?.trim();
+  if (!providerPriceId) {
+    return jsonErrorWithCode(
+      c,
+      'STRIPE_PRICE_NOT_CONFIGURED',
+      'Stripe price not configured for this variant',
+      400
+    );
   }
 
   let customerId: number | null = null;
@@ -135,7 +162,7 @@ checkout.post('/checkout/session', async (c) => {
   params.set('mode', 'payment');
   params.set('success_url', successUrl);
   params.set('cancel_url', cancelUrl);
-  params.set('line_items[0][price]', variantRow.provider_price_id);
+  params.set('line_items[0][price]', providerPriceId);
   params.set('line_items[0][quantity]', String(quantity));
   params.set('metadata[order_id]', String(orderId));
   params.set('payment_intent_data[metadata][order_id]', String(orderId));
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index 78890ce..87a0d67 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -214,6 +214,13 @@ dev.post('/provision-stripe-prices', async (c) => {
      ORDER BY pr.id ASC`
   ).all<StripeProvisionRow>();
 
+  const missingMappingRes = await c.env.DB.prepare(
+    `SELECT v.id as variant_id
+     FROM variants v
+     LEFT JOIN prices pr ON pr.variant_id = v.id
+     WHERE pr.id IS NULL`
+  ).all<{ variant_id: number }>();
+
   const updated: Array<{
     variant_id: number;
     price_id: number;
@@ -282,7 +289,10 @@ dev.post('/provision-stripe-prices', async (c) => {
     });
   }
 
-  return jsonOk(c, { updated });
+  return jsonOk(c, {
+    updated,
+    skipped_missing_mapping: missingMappingRes.results?.length ?? 0
+  });
 });
 
 export default dev;
```

Verification commands:
1. `rg -n "STRIPE_API_KEY" apps || true`
2. `rg -n "STRIPE_SECRET_KEY" apps/api`
3. `sed -n '20,70p' apps/api/src/routes/checkout.ts`
4. `pnpm -C apps/api test`
5. `pnpm -C apps/storefront build`
6. `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -s -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d "{\"variantId\":1,\"quantity\":1}"'`
7. `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=sk_test_xxx VARIANT_ID=1 pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -s -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d "{\"variantId\":${VARIANT_ID},\"quantity\":1}"'`
8. `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -s -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d "{\"variantId\":999999,\"quantity\":1}"'`
9. `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; trap "kill $pid" EXIT; sleep 3; curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"'`
10. `git status --short`

... (output truncated in bundle; full output: codex-runs/20260118-174505__api__checkout_session_stripe_error_handling/codex-output.md)
```

