You are an implementer.

HARD RULES

* Minimal diffs. No refactors.
* Keep existing endpoints behavior unchanged.
* No secrets in repo.
* Do NOT modify files under `codex-runs/*`.
* If you update `prompts/prompt.md`, do it in a separate commit from code changes.

GOAL
Stripe Webhook の「実運用で困るところ」をテストで潰し切る。
特に以下を vitest でE2E風に再現し、D1（mock）状態が期待通りであることを担保する。

* checkout.session.completed (paid 化)
* 署名検証（Stripe-Signature）
* event 再送の冪等性（events unique）
* refund.updated / refund.succeeded / charge.refunded の冪等性
* 同一 order に対する “別イベントID だけど同内容” の二重処理防止（payments/refunds の provider id unique で吸収）

CURRENT STATE

* `apps/api/src/routes/stripeWebhook.test.ts` に stateful D1 mock と “paid→duplicate→refund→duplicate” のフローが追加済み。
* refund INSERT の bind index は実コード（stripe.ts）に合わせること（provider_refund_id は args[3]）。

WHAT TO BUILD (NEXT)

1. Cover additional refund event types

* Add tests that send:

  * `refund.succeeded` (same payload shape as refund.updated)
  * `charge.refunded` (Stripe charge object with `refunds.data[]` list)
* Assert: refunds inserted once, events idempotent, and order status becomes 'refunded'.

2. “Different event id, same provider_refund_id” idempotency

* Send two different Stripe events (different `event.id`) but same `data.object.id` (refund id) and same payment_intent.
* Expect:

  * First: ok:true, duplicate:false
  * Second: ok:true, duplicate:true OR ok:true with no new refund row (depending on current production logic)
  * refunds count remains 1
  * events count increments to 2 (because event.id differs) BUT data effects do not duplicate.

3. “Different event id, same provider_payment_id” idempotency

* For paid flow, send two events (different event.id) with same checkout.session payment_intent and same orderId.
* Expect payments count remains 1 and order provider ids do not change after first write.

4. Make the mock stricter (optional but preferred)

* Avoid auto-creating orders on SELECT in the mock (no `getOrCreateOrder` on SELECT).
* Instead: require explicit seeding via options.orders; if missing, SELECT returns null.
* Update only the new tests accordingly so behavior remains accurate.

DELIVERABLES

* ONE unified diff patch.
* No changes to `codex-runs/*`.
* If you touch `prompts/prompt.md`, keep it as a separate commit from code changes (but prefer no prompt.md changes for this run).

VERIFICATION
After patch, output EXACTLY 10 copy/paste commands:

1. pnpm -C apps/api test -- stripeWebhook.test.ts
2. pnpm -C apps/api test
3. rg -n "refund.succeeded|charge.refunded" apps/api/src/routes/stripeWebhook.test.ts
4. rg -n "different event id" apps/api/src/routes/stripeWebhook.test.ts
5. rg -n "Different event id, same provider_refund_id" -S apps/api/src/routes/stripeWebhook.test.ts
6. rg -n "Different event id, same provider_payment_id" -S apps/api/src/routes/stripeWebhook.test.ts
7. git diff --stat
8. git status --short
9. git commit -m "test: extend stripe webhook idempotency (refund types + provider id dedupe)"
10. (optional) pnpm -C apps/api test -- -t "Stripe webhook route"

