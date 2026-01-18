Added the dev-only `/dev/provision-stripe-prices` endpoint to create Stripe products/prices for any prices missing `provider_price_id`, then persist the Stripe price id and return the updated mappings. This lives in `apps/api/src/routes/dev.ts` alongside the other dev-only route and keeps the existing admin-key protection unchanged while also enforcing `DEV_MODE` and the existing Stripe API key error wording.

Unified diff patch:
```diff
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index f9f7f47..48ff559 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -11,6 +11,15 @@ type SeedRequest = {
   makeInbox?: boolean;
 };
 
+type StripeProvisionRow = {
+  variant_id: number;
+  variant_title: string;
+  product_title: string;
+  price_id: number;
+  amount: number;
+  currency: string;
+};
+
 const dev = new Hono<Env>();
 
 const yesterday = () => {
@@ -178,4 +187,95 @@ dev.post('/seed', async (c) => {
   }
 });
 
+dev.post('/provision-stripe-prices', async (c) => {
+  if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);
+
+  const stripeKey = c.env.STRIPE_API_KEY;
+  if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
+
+  const rowsRes = await c.env.DB.prepare(
+    `SELECT v.id as variant_id,
+            v.title as variant_title,
+            p.title as product_title,
+            pr.id as price_id,
+            pr.amount as amount,
+            pr.currency as currency
+     FROM variants v
+     JOIN products p ON p.id = v.product_id
+     JOIN prices pr ON pr.variant_id = v.id
+     WHERE pr.provider_price_id IS NULL
+     ORDER BY pr.id ASC`
+  ).all<StripeProvisionRow>();
+
+  const updated: Array<{
+    variant_id: number;
+    price_id: number;
+    provider_price_id: string;
+  }> = [];
+
+  for (const row of rowsRes.results || []) {
+    const productParams = new URLSearchParams();
+    productParams.set('name', `${row.product_title} - ${row.variant_title}`);
+
+    const productRes = await fetch('https://api.stripe.com/v1/products', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${stripeKey}`,
+        'content-type': 'application/x-www-form-urlencoded'
+      },
+      body: productParams.toString()
+    });
+
+    if (!productRes.ok) {
+      const text = await productRes.text();
+      console.error(text);
+      return jsonError(c, 'Failed to create Stripe product', 500);
+    }
+
+    const product = await productRes.json<any>();
+    if (!product?.id) {
+      return jsonError(c, 'Invalid Stripe product', 500);
+    }
+
+    const priceParams = new URLSearchParams();
+    priceParams.set('unit_amount', String(row.amount));
+    priceParams.set('currency', row.currency.toLowerCase());
+    priceParams.set('product', product.id);
+    priceParams.set('metadata[variant_id]', String(row.variant_id));
+    priceParams.set('metadata[price_id]', String(row.price_id));
+
+    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
+      method: 'POST',
+      headers: {
+        authorization: `Bearer ${stripeKey}`,
+        'content-type': 'application/x-www-form-urlencoded'
+      },
+      body: priceParams.toString()
+    });
+
+    if (!priceRes.ok) {
+      const text = await priceRes.text();
+      console.error(text);
+      return jsonError(c, 'Failed to create Stripe price', 500);
+    }
+
+    const price = await priceRes.json<any>();
+    if (!price?.id) {
+      return jsonError(c, 'Invalid Stripe price', 500);
+    }
+
+    await c.env.DB.prepare(
+      `UPDATE prices SET provider_price_id=?, updated_at=datetime('now') WHERE id=?`
+    ).bind(price.id, row.price_id).run();
+
+    updated.push({
+      variant_id: row.variant_id,
+      price_id: row.price_id,
+      provider_price_id: price.id
+    });
+  }
+
+  return jsonOk(c, { updated });
+});
+
 export default dev;
```

Verification commands:
```sh
rg -n "provision-stripe-prices" apps/api/src/routes/dev.ts
curl -i -X POST http://127.0.0.1:8787/dev/provision-stripe-prices -H "x-admin-key: $ADMIN_API_KEY"
wrangler d1 execute <DBNAME> --local --command "SELECT provider_price_id FROM prices WHERE provider_price_id IS NOT NULL LIMIT 5;"
curl -i -X POST http://127.0.0.1:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'
Confirm it returns a Stripe session url/id (or next expected error if any)
```

Tests not run and no test files updated due to the “modify only `apps/api/src/routes/dev.ts`” constraint.
