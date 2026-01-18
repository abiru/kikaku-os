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
-  if (!variantRow.provider_price_id) {
-    return jsonError(c, 'Stripe price not configured for this variant', 400);
+  if (!variantRow) {
+    const variantExists = await c.env.DB.prepare(
+      `SELECT id FROM variants WHERE id=?`
+    ).bind(variantId).first<{ id: number }>();
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
