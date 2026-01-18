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
