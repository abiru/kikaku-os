# Codex run
- title: api: add dev endpoint for stripe prices
- generated: 2026-01-18T12:02:29+09:00
- branch: main
- head: 78b94ab

## Repo context
=== Codex Context (short) ===
2026-01-18T12:00:22+09:00

## Repo
branch: main
head:   78b94ab

## Status
## main...origin/main [ahead 13]
 M prompts/prompt.md
?? codex-runs/20260118-110416__infra__add_work_commit_flags_and_scope_mapping/
?? codex-runs/20260118-111248__infra__debug_bundle_missing/
?? codex-runs/20260118-112138__storefront__fetch_products_from_store_api/
?? codex-runs/20260118-120015__api__add_dev_endpoint_for_stripe_prices/

## Changed files (HEAD..WT)
prompts/prompt.md

## Diff stats (HEAD..WT)
 prompts/prompt.md | 44 +++++++++++++++++++++++++-------------------
 1 file changed, 25 insertions(+), 19 deletions(-)

## Recent commits
78b94ab storefront: fetch products from store api
b614e5e infra: ensure codex-run bundle is always generated
f2bc6eb chore: update codex prompt
e18f285 api: allow public GET access under /store
5156007 codex-run: api: allow public storefront get access
1452b1a chore: improve codex-run script and prompts
ff7bdea storefront: avoid localhost fallback in api base
28ae5ea codex-run: storefront: avoid localhost fallback in api base
716ff6c storefront: revamp layout, product pages, and UI components
f97a48b codex-run: storefront: review layout and product page changes
c464b69 codex-run: storefront: diagnostic verification plan for storefront changes
569f8b7 codex-run: storefront: revamp product pages and ui components
098320e codex-run: storefront: codex-run
fe3c267 storefront
e8cddbe first commit

_(full context: codex-runs/20260118-120015__api__add_dev_endpoint_for_stripe_prices/context.txt)_

## Prompt (what I gave to codex)
```
You are an implementer.

Goal:
Add a dev-only endpoint to provision missing Stripe prices for storefront variants, so checkout works without manual dashboard steps.

Constraints:

- Modify ONLY apps/api/src/routes/dev.ts (and optionally apps/api/src/routes/checkout.ts ONLY if absolutely required).
- Keep admin protection as-is (dev routes are already protected by x-admin-key via middleware).
- Use existing env: c.env.STRIPE_API_KEY, c.env.DB.
- Output: unified diff patch + 5 verification commands.

Behavior:

1. Add POST /dev/provision-stripe-prices
2. It finds variants whose price.provider_price_id IS NULL (join variants -> prices).
3. For each row, create Stripe Product and Stripe Price:
   - Product name: "<product_title> - <variant_title>"
   - Price: unit_amount = amount, currency = currency (from DB)
   - Set metadata: variant_id, price_id (string)
4. Update the corresponding DB price row: prices.provider_price_id = created Stripe price id.
5. Response includes a list of updated mappings: [{variant_id, price_id, provider_price_id}]
6. If STRIPE_API_KEY missing, return 500 with "Stripe API key not configured" (same wording ok).

Verification commands:

- rg -n "provision-stripe-prices" apps/api/src/routes/dev.ts
- curl -i -X POST http://127.0.0.1:8787/dev/provision-stripe-prices -H "x-admin-key: $ADMIN_API_KEY"
- wrangler d1 execute <DBNAME> --local --command "SELECT provider_price_id FROM prices WHERE provider_price_id IS NOT NULL LIMIT 5;"
- curl -i -X POST http://127.0.0.1:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'
- Confirm it returns a Stripe session url/id (or next expected error if any)

... (prompt truncated in bundle; full prompt: codex-runs/20260118-120015__api__add_dev_endpoint_for_stripe_prices/prompt.md)
```

## Codex output
```
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

... (output truncated in bundle; full output: codex-runs/20260118-120015__api__add_dev_endpoint_for_stripe_prices/codex-output.md)
```

