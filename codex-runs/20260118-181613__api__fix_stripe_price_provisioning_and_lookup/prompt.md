You are an implementer.

Goal:
Make Stripe price provisioning actually useful and debuggable with our current DB schema:
• variants table has no provider_price_id.
• prices table has provider_price_id and is the source of truth.

Problem:
POST /dev/provision-stripe-prices returns { updated: [] } even when checkout fails or when we add new variants/prices.

Constraints:
• Minimal, explicit changes. No refactors.
• No secrets committed.
• Keep wrangler dev –local working.
• Keep responses concise and user-safe.
• Output: unified diff + 10 verification commands.

Tasks: 1. Fix /checkout/session lookup correctness (if needed)

    •	Ensure the checkout query sources provider_price_id from prices.provider_price_id (not variants).
    •	Ensure it handles:
    •	missing price mapping (no prices row for variant) => 400 STRIPE_PRICE_NOT_CONFIGURED
    •	prices row exists but provider_price_id null/empty => 400 STRIPE_PRICE_NOT_CONFIGURED
    •	variant missing => 404 VARIANT_NOT_FOUND
    •	missing/invalid STRIPE_SECRET_KEY => existing guardrails remain

    2.	Improve /dev/provision-stripe-prices behavior

    •	It should:
    •	Find candidate prices rows that need provisioning:

a) prices.provider_price_id is null/empty
• For each candidate:
• Create a Stripe Price via Stripe API using amount/currency and a stable product reference.
• Write back provider_price_id into prices.provider_price_id.
• Also compute and return counts:
• updated_count
• skipped_already_configured_count
• skipped_missing_mapping_count (variants with no prices row)
• errors_count (don’t leak secrets; include a short per-price error list with {price_id, variant_id, message}).
• Keep JSON payload small.

    3.	Tests

    •	Extend existing vitest tests to cover:
    •	provisioning selects rows with null provider_price_id
    •	provisioning skips rows with provider_price_id already set
    •	provisioning reports missing_mapping_count correctly
    •	Mock fetch to Stripe; do not hit network.

    4.	Documentation (tiny)

    •	Add 1–2 lines in README (or apps/api README if exists) explaining:
    •	provider_price_id is stored in prices table
    •	if STRIPE_PRICE_NOT_CONFIGURED, run /dev/provision-stripe-prices

Output:
• One unified diff patch
• 10 copy/paste verification commands including:
• D1 queries to show missing provider_price_id rows
• start API and call /dev/provision-stripe-prices
• checkout/session returns 400 when provider_price_id missing, 200 when present (with real sk key, it can still fail with Stripe but should be actionable)
• pnpm -C apps/api test
• git status –short

Do not ask questions. If there’s ambiguity, choose the safest minimal behavior.
