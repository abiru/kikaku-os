Updated API Stripe env handling to use `STRIPE_SECRET_KEY` with pk-guardrails in `apps/api/src/routes/checkout.ts` and `apps/api/src/routes/dev.ts`, plus updated env typing/tests in `apps/api/src/env.ts` and `apps/api/src/routes/checkout.test.ts`. Added `apps/api/.dev.vars.example` and a small README note with the wrangler command update in `README.md`; storefront doesn’t use a Stripe publishable key, so no storefront changes. Tests not run.

```diff
diff --git a/apps/api/.dev.vars.example b/apps/api/.dev.vars.example
new file mode 100644
index 0000000..ad8c9e5
--- /dev/null
+++ b/apps/api/.dev.vars.example
@@ -0,0 +1,5 @@
+ADMIN_API_KEY=CHANGE_ME
+DEV_MODE=true
+STRIPE_SECRET_KEY=sk_test_xxx
+STRIPE_WEBHOOK_SECRET=whsec_xxx
+STOREFRONT_BASE_URL=http://localhost:4321
diff --git a/README.md b/README.md
index 8efddda..5cf7175 100644
--- a/README.md
+++ b/README.md
@@ -28,8 +28,9 @@ cp apps/api/.dev.vars.example apps/api/.dev.vars
 pnpm -C apps/api dev -- --port 8787
 
 # 初回スキーマ適用 (ローカル D1)
-wrangler d1 migrations apply ledkikaku-os --local
+pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local
 ```
+Stripe: `STRIPE_SECRET_KEY`(sk*) は `apps/api/.dev.vars` に設定。publishable key (pk*) は Storefront 側の env（使う場合のみ）へ。
 
 ### Admin
 ```bash
diff --git a/apps/api/src/env.ts b/apps/api/src/env.ts
index 9d4efb6..c13bc7f 100644
--- a/apps/api/src/env.ts
+++ b/apps/api/src/env.ts
@@ -4,7 +4,7 @@ export type Env = {
     R2: R2Bucket;
     ADMIN_API_KEY: string;
     DEV_MODE: string;
-    STRIPE_API_KEY: string;
+    STRIPE_SECRET_KEY: string;
     STRIPE_WEBHOOK_SECRET: string;
     STOREFRONT_BASE_URL: string;
   };
diff --git a/apps/api/src/routes/checkout.test.ts b/apps/api/src/routes/checkout.test.ts
index aaf596e..a37802d 100644
--- a/apps/api/src/routes/checkout.test.ts
+++ b/apps/api/src/routes/checkout.test.ts
@@ -65,7 +65,7 @@ describe('POST /checkout/session', () => {
 
     const env = {
       DB: createMockDb(steps),
-      STRIPE_API_KEY: 'sk_test_123',
+      STRIPE_SECRET_KEY: 'sk_test_123',
       STOREFRONT_BASE_URL: 'http://localhost:4321'
     } as any;
 
@@ -105,7 +105,7 @@ describe('POST /checkout/session', () => {
 
     const env = {
       DB: createMockDb(steps),
-      STRIPE_API_KEY: 'sk_test_123',
+      STRIPE_SECRET_KEY: 'sk_test_123',
       STOREFRONT_BASE_URL: 'http://localhost:4321'
     } as any;
 
@@ -135,7 +135,7 @@ describe('POST /checkout/session', () => {
 
     const env = {
       DB: createMockDb(steps, { provider_price_id: null }),
-      STRIPE_API_KEY: 'sk_test_123',
+      STRIPE_SECRET_KEY: 'sk_test_123',
       STOREFRONT_BASE_URL: 'http://localhost:4321'
     } as any;
 
@@ -154,4 +154,61 @@ describe('POST /checkout/session', () => {
     expect(json.ok).toBe(false);
     expect(fetchMock).not.toHaveBeenCalled();
   });
+
+  it('rejects missing stripe secret key', async () => {
+    const app = new Hono();
+    app.route('/', checkout);
+
+    const fetchMock = vi.fn();
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const env = {
+      DB: createMockDb([]),
+      STOREFRONT_BASE_URL: 'http://localhost:4321'
+    } as any;
+
+    const res = await app.request(
+      'http://localhost/checkout/session',
+      {
+        method: 'POST',
+        headers: { 'content-type': 'application/json' },
+        body: JSON.stringify({ variantId: 10, quantity: 1 })
+      },
+      env
+    );
+
+    const json = await res.json();
+    expect(res.status).toBe(500);
+    expect(json.message).toBe('Stripe API key not configured');
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
+
+  it('rejects publishable key in stripe secret key', async () => {
+    const app = new Hono();
+    app.route('/', checkout);
+
+    const fetchMock = vi.fn();
+    globalThis.fetch = fetchMock as unknown as typeof fetch;
+
+    const env = {
+      DB: createMockDb([]),
+      STRIPE_SECRET_KEY: 'pk_test_123',
+      STOREFRONT_BASE_URL: 'http://localhost:4321'
+    } as any;
+
+    const res = await app.request(
+      'http://localhost/checkout/session',
+      {
+        method: 'POST',
+        headers: { 'content-type': 'application/json' },
+        body: JSON.stringify({ variantId: 10, quantity: 1 })
+      },
+      env
+    );
+
+    const json = await res.json();
+    expect(res.status).toBe(500);
+    expect(json.message).toMatch('Stripe secret key looks like a publishable key');
+    expect(fetchMock).not.toHaveBeenCalled();
+  });
 });
diff --git a/apps/api/src/routes/checkout.ts b/apps/api/src/routes/checkout.ts
index 99c8ab4..3277e51 100644
--- a/apps/api/src/routes/checkout.ts
+++ b/apps/api/src/routes/checkout.ts
@@ -27,8 +27,15 @@ const isValidEmail = (value: string) => {
 };
 
 checkout.post('/checkout/session', async (c) => {
-  const stripeKey = c.env.STRIPE_API_KEY;
+  const stripeKey = c.env.STRIPE_SECRET_KEY;
   if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
+  if (stripeKey.startsWith('pk')) {
+    return jsonError(
+      c,
+      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
+      500
+    );
+  }
 
   let body: any;
   try {
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index 48ff559..454ba6f 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -190,8 +190,15 @@ dev.post('/seed', async (c) => {
 dev.post('/provision-stripe-prices', async (c) => {
   if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);
 
-  const stripeKey = c.env.STRIPE_API_KEY;
+  const stripeKey = c.env.STRIPE_SECRET_KEY;
   if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
+  if (stripeKey.startsWith('pk')) {
+    return jsonError(
+      c,
+      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
+      500
+    );
+  }
 
   const rowsRes = await c.env.DB.prepare(
     `SELECT v.id as variant_id,
```

Verification commands:
```
rg -n "STRIPE_API_KEY" apps/api apps/storefront || true
rg -n "STRIPE_SECRET_KEY" apps/api
cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars
STRIPE_SECRET_KEY=pk_test_xxx curl -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: $ADMIN_API_KEY"
STRIPE_SECRET_KEY=sk_test_xxx curl -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: $ADMIN_API_KEY"
curl -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'
pnpm -C apps/api test
pnpm -C apps/storefront build
```
