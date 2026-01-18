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
