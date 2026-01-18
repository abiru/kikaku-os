Updated Stripe price provisioning to target `prices.provider_price_id`, reuse a stable Stripe product per variant via metadata search, and return concise counts plus per‑price error details; added focused provisioning tests and clarified the source of truth in docs. Checkout already uses `prices.provider_price_id` with the required error behavior, so no change was needed there.

Details by file:
- `apps/api/src/routes/dev.ts` now selects rows with null/empty `provider_price_id`, reuses/creates Stripe products by `variant_id` metadata, updates `prices.provider_price_id`, and returns counts + short error list.
- `apps/api/src/routes/dev.test.ts` adds vitest coverage for provisioning selection, configured skips, and missing mapping counts with mocked Stripe fetch.
- `README.md` documents that `provider_price_id` lives in `prices` and points to `/dev/provision-stripe-prices`.

Unified diff:
```diff
diff --git a/README.md b/README.md
index 706dbe6..ce396b6 100644
--- a/README.md
+++ b/README.md
@@ -30,7 +30,7 @@ pnpm -C apps/api dev -- --port 8787
 # 初回スキーマ適用 (ローカル D1)
 pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
-Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、variant に `provider_price_id` があることを確認。
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。`STRIPE_WEBHOOK_SECRET`(whsec*) も `apps/api/.dev.vars` に設定（Webhook ルートのみ必要）。API は `STRIPE_SECRET_KEY` が未設定/`pk*` の場合 500 を返す。Storefront は現状 publishable key 不要だが、必要になった場合は `apps/storefront/.env` の `PUBLIC_STRIPE_PUBLISHABLE_KEY`(pk*) を使う（pk* は Storefront 用、sk* は API 用）。Stripe の `provider_price_id` は `prices` テーブルに保持する。Checkout で `STRIPE_PRICE_NOT_CONFIGURED` が返る場合は dev で `/dev/provision-stripe-prices` を実行し、`prices.provider_price_id` に値が入ることを確認。
 
 ### Admin
 ```bash
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index 87a0d67..8646112 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -14,6 +14,7 @@ type SeedRequest = {
 type StripeProvisionRow = {
   variant_id: number;
   variant_title: string;
+  product_id: number;
   product_title: string;
   price_id: number;
   amount: number;
@@ -203,6 +204,7 @@ dev.post('/provision-stripe-prices', async (c) => {
   const rowsRes = await c.env.DB.prepare(
     `SELECT v.id as variant_id,
             v.title as variant_title,
+            v.product_id as product_id,
             p.title as product_title,
             pr.id as price_id,
             pr.amount as amount,
@@ -210,10 +212,16 @@ dev.post('/provision-stripe-prices', async (c) => {
      FROM variants v
      JOIN products p ON p.id = v.product_id
      JOIN prices pr ON pr.variant_id = v.id
-     WHERE pr.provider_price_id IS NULL
+     WHERE COALESCE(TRIM(pr.provider_price_id), '') = ''
      ORDER BY pr.id ASC`
   ).all<StripeProvisionRow>();
 
+  const configuredCountRes = await c.env.DB.prepare(
+    `SELECT COUNT(*) as count
+     FROM prices
+     WHERE COALESCE(TRIM(provider_price_id), '') != ''`
+  ).first<{ count: number }>();
+
   const missingMappingRes = await c.env.DB.prepare(
     `SELECT v.id as variant_id
      FROM variants v
@@ -221,77 +229,136 @@ dev.post('/provision-stripe-prices', async (c) => {
      WHERE pr.id IS NULL`
   ).all<{ variant_id: number }>();
 
-  const updated: Array<{
-    variant_id: number;
-    price_id: number;
-    provider_price_id: string;
-  }> = [];
-
-  for (const row of rowsRes.results || []) {
-    const productParams = new URLSearchParams();
-    productParams.set('name', `${row.product_title} - ${row.variant_title}`);
-
-    const productRes = await fetch('https://api.stripe.com/v1/products', {
-      method: 'POST',
-      headers: {
-        authorization: `Bearer ${stripeKey}`,
-        'content-type': 'application/x-www-form-urlencoded'
-      },
-      body: productParams.toString()
-    });
-
-    if (!productRes.ok) {
-      const text = await productRes.text();
-      console.error(text);
-      return jsonError(c, 'Failed to create Stripe product', 500);
+  const errors: Array<{ price_id: number; variant_id: number; message: string }> = [];
+  const configuredCount = Number(configuredCountRes?.count ?? 0);
+  let updatedCount = 0;
+  const productCache = new Map<number, string>();
+
+  const readStripeErrorMessage = async (res: Response, fallback: string) => {
+    try {
+      const data = await res.json<any>();
+      const message = data?.error?.message;
+      if (message && typeof message === 'string') return message.slice(0, 160);
+    } catch {
+      // ignore JSON parse failures
     }
+    return `${fallback} (status ${res.status})`;
+  };
 
-    const product = await productRes.json<any>();
-    if (!product?.id) {
-      return jsonError(c, 'Invalid Stripe product', 500);
-    }
+  for (const row of rowsRes.results || []) {
+    try {
+      let productId = productCache.get(row.variant_id);
+      if (!productId) {
+        const searchParams = new URLSearchParams();
+        searchParams.set('query', `metadata['variant_id']:'${row.variant_id}'`);
+        const searchRes = await fetch(
+          `https://api.stripe.com/v1/products/search?${searchParams.toString()}`,
+          {
+            method: 'GET',
+            headers: {
+              authorization: `Bearer ${stripeKey}`
+            }
+          }
+        );
+
+        if (!searchRes.ok) {
+          const message = await readStripeErrorMessage(searchRes, 'Failed to search Stripe products');
+          errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
+          continue;
+        }
+
+        const searchResult = await searchRes.json<any>();
+        productId = searchResult?.data?.[0]?.id;
+        if (!productId) {
+          const productParams = new URLSearchParams();
+          productParams.set('name', `${row.product_title} - ${row.variant_title}`);
+          productParams.set('metadata[variant_id]', String(row.variant_id));
+          productParams.set('metadata[product_id]', String(row.product_id));
+
+          const productRes = await fetch('https://api.stripe.com/v1/products', {
+            method: 'POST',
+            headers: {
+              authorization: `Bearer ${stripeKey}`,
+              'content-type': 'application/x-www-form-urlencoded'
+            },
+            body: productParams.toString()
+          });
+
+          if (!productRes.ok) {
+            const message = await readStripeErrorMessage(productRes, 'Failed to create Stripe product');
+            errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
+            continue;
+          }
+
+          const product = await productRes.json<any>();
+          productId = product?.id;
+        }
+
+        if (!productId) {
+          errors.push({
+            price_id: row.price_id,
+            variant_id: row.variant_id,
+            message: 'Stripe product not available for price provisioning'
+          });
+          continue;
+        }
+
+        productCache.set(row.variant_id, productId);
+      }
 
-    const priceParams = new URLSearchParams();
-    priceParams.set('unit_amount', String(row.amount));
-    priceParams.set('currency', row.currency.toLowerCase());
-    priceParams.set('product', product.id);
-    priceParams.set('metadata[variant_id]', String(row.variant_id));
-    priceParams.set('metadata[price_id]', String(row.price_id));
-
-    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
-      method: 'POST',
-      headers: {
-        authorization: `Bearer ${stripeKey}`,
-        'content-type': 'application/x-www-form-urlencoded'
-      },
-      body: priceParams.toString()
-    });
+      const priceParams = new URLSearchParams();
+      priceParams.set('unit_amount', String(row.amount));
+      priceParams.set('currency', (row.currency || 'JPY').toLowerCase());
+      priceParams.set('product', productId);
+      priceParams.set('metadata[variant_id]', String(row.variant_id));
+      priceParams.set('metadata[price_id]', String(row.price_id));
+
+      const priceRes = await fetch('https://api.stripe.com/v1/prices', {
+        method: 'POST',
+        headers: {
+          authorization: `Bearer ${stripeKey}`,
+          'content-type': 'application/x-www-form-urlencoded'
+        },
+        body: priceParams.toString()
+      });
+
+      if (!priceRes.ok) {
+        const message = await readStripeErrorMessage(priceRes, 'Failed to create Stripe price');
+        errors.push({ price_id: row.price_id, variant_id: row.variant_id, message });
+        continue;
+      }
 
-    if (!priceRes.ok) {
-      const text = await priceRes.text();
-      console.error(text);
-      return jsonError(c, 'Failed to create Stripe price', 500);
-    }
+      const price = await priceRes.json<any>();
+      if (!price?.id) {
+        errors.push({
+          price_id: row.price_id,
+          variant_id: row.variant_id,
+          message: 'Stripe price response missing id'
+        });
+        continue;
+      }
 
-    const price = await priceRes.json<any>();
-    if (!price?.id) {
-      return jsonError(c, 'Invalid Stripe price', 500);
+      await c.env.DB.prepare(
+        `UPDATE prices SET provider_price_id=?, updated_at=datetime('now') WHERE id=?`
+      ).bind(price.id, row.price_id).run();
+
+      updatedCount += 1;
+    } catch (err) {
+      console.error(err);
+      errors.push({
+        price_id: row.price_id,
+        variant_id: row.variant_id,
+        message: 'Unexpected error provisioning Stripe price'
+      });
     }
-
-    await c.env.DB.prepare(
-      `UPDATE prices SET provider_price_id=?, updated_at=datetime('now') WHERE id=?`
-    ).bind(price.id, row.price_id).run();
-
-    updated.push({
-      variant_id: row.variant_id,
-      price_id: row.price_id,
-      provider_price_id: price.id
-    });
   }
 
   return jsonOk(c, {
-    updated,
-    skipped_missing_mapping: missingMappingRes.results?.length ?? 0
+    updated_count: updatedCount,
+    skipped_already_configured_count: configuredCount,
+    skipped_missing_mapping_count: missingMappingRes.results?.length ?? 0,
+    errors_count: errors.length,
+    errors
   });
 });
 
diff --git a/apps/api/src/routes/dev.test.ts b/apps/api/src/routes/dev.test.ts
new file mode 100644
index 0000000..cc83069
--- /dev/null
+++ b/apps/api/src/routes/dev.test.ts
@@ -0,0 +1,155 @@
+import { describe, it, expect, vi } from 'vitest';
+import { Hono } from 'hono';
+import dev from './dev';
+
+type StripeProvisionRow = {
+  variant_id: number;
+  variant_title: string;
+  product_id: number;
+  product_title: string;
+  price_id: number;
+  amount: number;
+  currency: string;
+};
+
+const createMockDb = (options: {
+  candidates?: StripeProvisionRow[];
+  configuredCount?: number;
+  missingMappingCount?: number;
+}) => {
+  const calls: { sql: string; bind: unknown[] }[] = [];
+  return {
+    calls,
+    prepare: (sql: string) => ({
+      bind: (...args: unknown[]) => ({
+        all: async () => {
+          if (sql.includes('JOIN prices pr') && sql.includes('COALESCE(TRIM(pr.provider_price_id)')) {
+            return { results: options.candidates ?? [] };
+          }
+          if (sql.includes('LEFT JOIN prices')) {
+            const count = options.missingMappingCount ?? 0;
+            return {
+              results: Array.from({ length: count }, (_, index) => ({ variant_id: index + 1 }))
+            };
+          }
+          return { results: [] };
+        },
+        first: async () => {
+          if (sql.includes('COUNT(*)')) {
+            return { count: options.configuredCount ?? 0 };
+          }
+          return null;
+        },
+        run: async () => {
+          calls.push({ sql, bind: args });
+          return { meta: { last_row_id: 1, changes: 1 } };
+        }
+      })
+    })
+  };
+};
+
+describe('POST /dev/provision-stripe-prices', () => {
+  it('provisions prices with missing provider_price_id', async () => {
+    const app = new Hono();
+    app.route('/dev', dev);
+
+    const mockDb = createMockDb({
+      candidates: [
+        {
+          variant_id: 10,
+          variant_title: 'Standard',
+          product_id: 1,
+          product_title: 'Sample',
+          price_id: 99,
+          amount: 1200,
+          currency: 'JPY'
+        }
+      ],
+      configuredCount: 0,
+      missingMappingCount: 0
+    });
+
+    const fetchMock = vi.fn(async (url) => {
+      const urlStr = String(url);
+      if (urlStr.includes('/v1/products/search')) {
+        return {
+          ok: true,
+          json: async () => ({ data: [] })
+        } as Response;
+      }
+      if (urlStr.includes('/v1/products')) {
+        return {
+          ok: true,
+          json: async () => ({ id: 'prod_test_123' })
+        } as Response;
+      }
+      if (urlStr.includes('/v1/prices')) {
+        return {
+          ok: true,
+          json: async () => ({ id: 'price_test_123' })
+        } as Response;
+      }
+      return {
+        ok: false,
+        status: 404,
+        json: async () => ({}),
+        text: async () => 'not found'
+      } as Response;
+    });
+
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const res = await app.request(
+      'http://localhost/dev/provision-stripe-prices',
+      { method: 'POST' },
+      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
+    );
+
+    const json = await res.json();
+    expect(json.ok).toBe(true);
+    expect(json.updated_count).toBe(1);
+    expect(json.errors_count).toBe(0);
+    expect(json.skipped_already_configured_count).toBe(0);
+    expect(json.skipped_missing_mapping_count).toBe(0);
+    expect(mockDb.calls.some((call) => call.sql.includes('UPDATE prices'))).toBe(true);
+    expect(fetchMock).toHaveBeenCalled();
+  });
+
+  it('skips already configured prices', async () => {
+    const app = new Hono();
+    app.route('/dev', dev);
+
+    const mockDb = createMockDb({
+      candidates: [],
+      configuredCount: 2,
+      missingMappingCount: 0
+    });
+
+    const fetchMock = vi.fn();
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const res = await app.request(
+      'http://localhost/dev/provision-stripe-prices',
+      { method: 'POST' },
+      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
+    );
+
+    const json = await res.json();
+    expect(json.ok).toBe(true);
+    expect(json.updated_count).toBe(0);
+    expect(json.skipped_already_configured_count).toBe(2);
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it('reports missing mapping count', async () => {
+    const app = new Hono();
+    app.route('/dev', dev);
+
+    const mockDb = createMockDb({
+      candidates: [],
+      configuredCount: 0,
+      missingMappingCount: 3
+    });
+
+    const fetchMock = vi.fn();
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const res = await app.request(
+      'http://localhost/dev/provision-stripe-prices',
+      { method: 'POST' },
+      { DB: mockDb, DEV_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_123' } as any
+    );
+
+    const json = await res.json();
+    expect(json.ok).toBe(true);
+    expect(json.skipped_missing_mapping_count).toBe(3);
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+});
```

Verification commands (10):
```bash
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --command "SELECT id, variant_id, provider_price_id FROM prices WHERE provider_price_id IS NULL OR TRIM(provider_price_id) = '';"
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --command "SELECT v.id AS variant_id FROM variants v LEFT JOIN prices pr ON pr.variant_id = v.id WHERE pr.id IS NULL;"
pnpm -C apps/api dev -- --port 8787
curl -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME" -H "content-type: application/json" -d '{}'
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --command "SELECT COUNT(*) AS configured_count FROM prices WHERE provider_price_id IS NOT NULL AND TRIM(provider_price_id) != '';"
pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --command "SELECT id, variant_id, provider_price_id FROM prices WHERE provider_price_id IS NOT NULL AND TRIM(provider_price_id) != '' ORDER BY id DESC LIMIT 5;"
curl -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":<MISSING_VARIANT_ID>,"quantity":1}'
curl -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":<CONFIGURED_VARIANT_ID>,"quantity":1}'
pnpm -C apps/api test
git status --short
```

I noticed unrelated changes in `prompts/prompt.md` and `codex-runs/20260118-181613__api__fix_stripe_price_provisioning_and_lookup/` that I didn’t touch. How would you like me to proceed with those?
