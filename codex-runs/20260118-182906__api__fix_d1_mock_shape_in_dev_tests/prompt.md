You are an implementer.

Goal:
Fix failing vitest tests in apps/api/src/routes/dev.test.ts by correcting the DB mock shape to match Cloudflare D1 usage in apps/api/src/routes/dev.ts.

Current failure:
TypeError: c.env.DB.prepare(...).all is not a function
Also JSON parse fails because endpoint returns Internal Server Error due to the above.

Constraints:

- Minimal changes.
- Only touch tests unless absolutely required.
- Do NOT edit prompts/ or scripts/.
- Keep existing behavior of dev.ts unchanged.
- Output: unified diff + 5 verification commands.

Task:

1. Update apps/api/src/routes/dev.test.ts mock DB so:

   - DB.prepare(sql) returns an object with:
     - bind(...args) => same object (store args if needed)
     - all() => returns { results: [...] }
     - first() => returns a single row (or null)
     - run() => returns something like { success: true } (if used)
   - Ensure it supports the queries used by /dev/provision-stripe-prices:
     a) SELECT ... FROM variants/products/prices ... WHERE COALESCE(TRIM(pr.provider_price_id),'')='' => return candidates list from test fixtures
     b) SELECT COUNT(\*) ... FROM prices WHERE provider_price_id ... => return configuredCount from fixtures
     c) SELECT v.id ... LEFT JOIN prices ... WHERE pr.id IS NULL => return missingMappingCount from fixtures
     d) UPDATE prices SET provider_price_id = ? WHERE id = ? => record call and succeed

2. Ensure the existing three tests pass:

   - provisions prices with missing provider_price_id
   - skips already configured prices
   - reports missing mapping count

3. Keep fetch mock as-is; no network.

Output:

- unified diff patch only
- 5 verification commands:
  - pnpm -C apps/api test
  - pnpm -C apps/api test src/routes/dev.test.ts
  - rg -n "provision-stripe-prices" apps/api/src/routes/dev.ts apps/api/src/routes/dev.test.ts
  - git diff --stat
  - git status --short
