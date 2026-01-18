# AGENTS

## Repo invariants
- Monorepo layout must stay: `apps/admin`, `apps/api`, `apps/storefront`, `migrations`.
- Package manager is pnpm; do not replace with npm/yarn.
- Keep React Router v7 imports from `react-router` in Admin.

## Secrets policy
- Never commit secrets or API keys to tracked files.
- Use `.dev.vars` for Wrangler dev and `.env` for app configs; only `.env.example`/`.dev.vars.example` are tracked.

## Dependency workflow
- Keep npm globally updated: `npm i -g npm@latest`.
- Install/update via pnpm and commit lockfile changes as needed.
- Avoid unnecessary dependency churn.

## Migrations
- Add new migrations under `migrations/` with incremental numbering.
- Verify local D1 with `pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local`.

## Testing rules
- Always add or update tests with changes.
- Documentation-only changes may skip tests, but note the omission in the final summary.
- Run and pass:
  - `pnpm -C apps/admin test`
  - `pnpm -C apps/api test`
  - `pnpm -C apps/storefront build` (or tests if added)

## Post-change checklist
- `pnpm -C apps/admin install`
- `pnpm -C apps/admin test`
- `pnpm -C apps/api install`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront install`
- `pnpm -C apps/storefront build`

## Documentation hygiene
- When you change API surface area or env vars, update README.md and PLANS.md accordingly.
