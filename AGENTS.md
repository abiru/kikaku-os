# Repository Guidelines

## Project Structure & Module Organization
- `apps/api`: Cloudflare Workers + Hono API (TypeScript). Core code is in `apps/api/src`, organized by domain (`routes/`, `services/`, `lib/`, `middleware/`, `__tests__/`).
- `apps/storefront`: Astro SSR storefront/admin app. Main code is in `apps/storefront/src` (`components/`, `pages/`, `layouts/`, `lib/`, `styles/`).
- `migrations/` and `apps/api/migrations/`: D1 schema and migration SQL.
- `docs/`: deployment and operational runbooks. `scripts/`: local/dev automation and smoke helpers.
- `.github/workflows/`: CI and deployment pipelines; treat these as the source of truth for required checks.

## Build, Test, and Development Commands
- `pnpm env:setup`: create local env files from templates.
- `pnpm db:migrate`: apply local D1 migrations.
- `pnpm dev`: run API (`:8787`) and storefront (`:4321`) together.
- `pnpm dev:api` / `pnpm dev:store`: run each app independently.
- `pnpm build`: build both apps; use `pnpm build:api` or `pnpm build:store` for scoped builds.
- `pnpm test`: run API tests from repo root.
- `pnpm -C apps/api test:coverage`: API coverage report (text/json/html).
- `pnpm -C apps/storefront test`: storefront Vitest suite.

## Coding Style & Naming Conventions
- Language: TypeScript/ESM. Follow existing style in touched files; avoid unrelated reformatting.
- Use `camelCase` for functions/variables, `PascalCase` for React/Astro component files, and descriptive route files like `adminProducts.ts`.
- API responses should use shared helpers (`jsonOk`, `jsonError`) rather than ad-hoc shapes.
- Keep modules domain-focused: route handlers in `routes/*`, business logic in `services/*`, shared utilities in `lib/*`.

## Testing Guidelines
- Framework: Vitest in both apps.
- API tests: `apps/api/src/__tests__/**/*.test.ts`; integration tests must end with `*.integration.test.ts`.
- API coverage thresholds are enforced at 50% (lines/functions/branches/statements).
- Storefront tests live near source as `src/**/*.test.ts`.
- Add or update tests with every behavior change, especially for routes, services, and checkout/payment flows.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat:`, `fix:`, `refactor:`, `test:`.
- Prefer concise, imperative subjects; include issue/PR refs when relevant (example: `feat: add X (Issue #123)`).
- PRs should include: scope summary, linked issue, test commands run, and screenshots/GIFs for UI changes.
- Ensure CI-equivalent checks pass locally before review (`typecheck`, tests, build).

## Security & Configuration Tips
- Never commit secrets (`.dev.vars`, `.env`); keep local values in ignored files and use `.dev.vars.example` as a template.
- For production, use Wrangler/Cloudflare secrets, not plaintext files.
- Dev seed endpoints are for local mode only (`DEV_MODE=true`).
