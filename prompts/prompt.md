You are an implementer.

HARD RULES
- Minimal diffs. No refactors.
- Do NOT modify files under `codex-runs/*`.
- Do NOT modify `prompts/prompt.md`.
- No secrets in repo.
- Keep existing endpoints behavior unchanged.

GOAL
手動でやっている Stripe webhook の動作確認（paid/refund/idempotency）を、vitest のテストで完全に再現できるようにする。
「D1に注文を作る→署名付きWebhookを投げる→D1の状態が期待通りになる→同じevent再送で重複しない→refundも同様」
この一連をテストだけで担保したい。

CONTEXT
- `POST /stripe/webhook` exists and verifies Stripe signature.
- D1 tables: orders, payments, refunds, events (events has stripe_event_id + unique index).
- Existing tests: `apps/api/src/routes/stripeWebhook.test.ts` already checks missing secret, invalid signature, and some handler logic.

WHAT TO BUILD

1) Add a stateful D1 mock for Stripe webhook tests (mandatory)
- Improve/extend the existing mock used in `stripeWebhook.test.ts` so it can hold in-memory state:
  - orders (by id)
  - payments (list)
  - refunds (list)
  - events (set of stripe_event_id for uniqueness)
- The mock should support the SQL patterns used by `apps/api/src/routes/stripe.ts`:
  - SELECT orders by id
  - UPDATE orders paid fields (status, paid_at, provider ids)
  - INSERT payments (provider_payment_id uniqueness handling if relevant)
  - SELECT payments by provider_payment_id and/or order_id
  - INSERT refunds with provider_refund_id uniqueness
  - SELECT refunds by provider_refund_id
  - INSERT events with stripe_event_id unique constraint behavior (duplicates should throw or be handled consistently with production logic)
- Keep the mock implementation minimal and local to tests (prefer in the same test file or a small helper under `apps/api/src/routes/__tests__/` etc).

2) Add an "end-to-end style" test that replaces manual verification (mandatory)
Add tests to `apps/api/src/routes/stripeWebhook.test.ts` (or a new file) that:
- Seeds an order in the mock DB (id, status='pending', total_net=10000, currency='JPY', etc).
- Sends a valid signed webhook event:
  - `checkout.session.completed` with metadata.orderId = seeded id
  - Should result in:
    - orders[id].status becomes 'paid'
    - paid_at is set
    - provider_checkout_session_id and provider_payment_intent_id are set (first write wins; no overwrite on replays)
    - payment row inserted for that order with provider_payment_id = payment_intent
    - events contains stripe_event_id
- Re-sends the exact same event id again:
  - response JSON includes duplicate:true (or equivalent)
  - events count remains 1
  - payments count remains 1
  - order remains paid, paid_at unchanged

3) Add a refund test with idempotency (mandatory)
- After the paid test, send a valid signed `refund.updated` event:
  - object.id = provider_refund_id, payment_intent references the same provider_payment_id
  - metadata.orderId also present
- Assert:
  - refunds row inserted with provider_refund_id
  - refunds row links to the correct payment_id
  - re-sending same refund event id does not duplicate rows (refunds count stable, events count stable)

4) Reduce developer friction (optional but nice)
- Add a tiny helper in tests to build signed Stripe-Signature header:
  - reuse existing computeStripeSignature helper if available in repo
  - or add a local helper in the test file
- Avoid brittle parsing; do not rely on wrangler output.

DELIVERABLES
- Provide ONE unified diff patch (no changes to `prompts/prompt.md`, none under `codex-runs/*`).
- Keep patch surgical.

VERIFICATION COMMANDS
After the patch, output EXACTLY 10 copy/paste commands:
- pnpm -C apps/api test
- rg showing the new tests
- (optional) one command to run only stripeWebhook test file
- git diff --stat
- git status --short
- (do not run) git commit -m "test: stripe webhook E2E-style idempotency (paid/refund)"

