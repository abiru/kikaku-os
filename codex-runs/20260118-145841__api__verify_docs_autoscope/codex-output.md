No code changes needed; `apps/api/src/routes/checkout.ts` and `apps/api/src/routes/dev.ts` already use `STRIPE_SECRET_KEY` with pk-guardrails, and env examples plus `README.md` already document the correct key placement. Storefront has no Stripe publishable key usage, so there’s nothing to rename there.

**Diff**
```diff
(no changes required)
```

**Verification Commands**
- `rg -n "STRIPE_API_KEY" apps/api apps/storefront || true`
- `rg -n "STRIPE_SECRET_KEY" apps/api`
- `cp apps/api/.dev.vars.example apps/api/.dev.vars && sed -n '1,80p' apps/api/.dev.vars`
- `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=pk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; sleep 2; curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"; kill $pid'`
- `sh -c 'ADMIN_API_KEY=CHANGE_ME DEV_MODE=true STRIPE_SECRET_KEY=sk_test_xxx pnpm -C apps/api dev -- --port 8787 >/tmp/kikaku-api.log 2>&1 & pid=$!; sleep 2; curl -s -i -X POST http://localhost:8787/dev/provision-stripe-prices -H "x-admin-key: CHANGE_ME"; kill $pid'`
- `curl -s -i -X POST http://localhost:8787/checkout/session -H "content-type: application/json" -d '{"variantId":1,"quantity":1,"email":"test@example.com"}'`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`
