# AGENTS

## Dependency alignment
- Refine v5 + @refinedev/kbar v2 + @refinedev/react-router v2 + TanStack Query v5 must stay in sync.
- Do not reintroduce @refinedev/react-router-v6 or react-router-dom.

## Package management
- Keep npm globally updated: `npm i -g npm@latest`.
- Project installs and lockfiles are managed with pnpm only.
- After dependency changes, run `pnpm -C apps/admin install` and `pnpm -C apps/api install` to refresh lockfiles.

## Testing rules
- Always add or update tests with changes.
- Run and pass:
  - `pnpm -C apps/admin test`
  - `pnpm -C apps/api test`

## Change workflow
- Update code and dependencies together.
- Refresh lockfiles with pnpm.
- Validate Admin startup after cache cleanup when needed.

## Post-change checklist
- `pnpm -C apps/admin install`
- `rm -rf apps/admin/node_modules/.vite`
- `pnpm -C apps/admin test`
- `pnpm -C apps/admin dev`
- `pnpm -C apps/api install`
- `pnpm -C apps/api test`
