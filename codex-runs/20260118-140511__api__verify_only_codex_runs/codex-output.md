Switched the dev provisioner to read `STRIPE_API_KEY` (with a local cast to avoid touching env typings), updated the publishable-key guard text, and send the DB currency value as-is in `apps/api/src/routes/dev.ts` to match the requested behavior.

**Unified Diff Patch**
```diff
diff --git a/apps/api/src/routes/dev.ts b/apps/api/src/routes/dev.ts
index 78890ce..6b3b213 100644
--- a/apps/api/src/routes/dev.ts
+++ b/apps/api/src/routes/dev.ts
@@ -190,12 +190,12 @@ dev.post('/seed', async (c) => {
 dev.post('/provision-stripe-prices', async (c) => {
   if (c.env.DEV_MODE !== 'true') return jsonError(c, 'Not found', 404);
 
-  const stripeKey = c.env.STRIPE_SECRET_KEY;
+  const stripeKey = (c.env as { STRIPE_API_KEY?: string }).STRIPE_API_KEY;
   if (!stripeKey) return jsonError(c, 'Stripe API key not configured', 500);
   if (stripeKey.startsWith('pk_')) {
     return jsonError(
       c,
-      'Stripe secret key looks like a publishable key (pk*). Use STRIPE_SECRET_KEY with an sk* value.',
+      'Stripe API key looks like a publishable key (pk*). Use STRIPE_API_KEY with an sk* value.',
       500
     );
   }
@@ -246,7 +246,7 @@ dev.post('/provision-stripe-prices', async (c) => {
 
     const priceParams = new URLSearchParams();
     priceParams.set('unit_amount', String(row.amount));
-    priceParams.set('currency', row.currency.toLowerCase());
+    priceParams.set('currency', row.currency);
     priceParams.set('product', product.id);
     priceParams.set('metadata[variant_id]', String(row.variant_id));
     priceParams.set('metadata[price_id]', String(row.price_id));
```

**Verification Commands**
- `rg -n "provision-stripe-prices" apps/api/src/routes/dev.ts`
- `curl -i -X POST http://127.0.0.1:8787/dev/provision-stripe-prices -H "x-admin-key: $ADMIN_API_KEY"`
- `wrangler d1 execute <DBNAME> --local --command "SELECT provider_price_id FROM prices WHERE provider_price_id IS NOT NULL LIMIT 5;"`
- `curl -i -X POST http://127.0.0.1:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1}'`
- `Confirm it returns a Stripe session url/id (or next expected error if any)`

Tests not run here (scope limited to `apps/api/src/routes/dev.ts` per instructions). If you want me to update `apps/api/src/env.ts` to include `STRIPE_API_KEY` in typings, say the word.
