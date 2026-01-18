You are an implementer.

Goal:
Finish the Stripe env-var cleanup and documentation so local dev cannot mix pk/sk keys.

Current state:

- API uses STRIPE_SECRET_KEY with guardrails in checkout/dev endpoints.
- apps/api/.dev.vars.example exists.
- apps/storefront/.env.example exists with PUBLIC_API_BASE.
- Root README has a Stripe note.
- There is a stray whitespace-only change in apps/admin/package.json that must NOT be committed.

Constraints:

- Keep changes minimal and explicit. No refactors.
- No real secrets committed.
- Do not modify admin app files. Do not commit whitespace-only changes.

Tasks:

1. Ensure repo is clean from unrelated changes:
   - Revert apps/admin/package.json if it only contains trailing whitespace/newline changes.
2. Ensure documentation is consistent:
   - Root README must clearly state:
     - STRIPE*SECRET_KEY (sk*\*) goes to apps/api/.dev.vars
     - STRIPE*WEBHOOK_SECRET (whsec*\*) goes to apps/api/.dev.vars (only needed for webhook route)
     - Storefront does NOT currently require a Stripe publishable key; if needed in the future, use PUBLIC*STRIPE_PUBLISHABLE_KEY (pk*\*) in storefront env.
3. Ensure no leftover STRIPE_API_KEY usage anywhere in apps/api or apps/storefront.
4. Output:
   - unified diff patch
   - 8 copy/paste verification commands (include git status checks and rg checks).

Verification commands must include:

- rg for STRIPE_API_KEY/STRIPE_SECRET_KEY
- show README Stripe lines
- show apps/api/.dev.vars.example contents
- run pnpm -C apps/api test
- run pnpm -C apps/storefront build
- confirm git status is clean except codex-runs/ if generated

Do not ask questions. If something is ambiguous, choose the safest minimal action.
