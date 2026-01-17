# Admin App

## Router policy
- Use `react-router` v7 for imports across the codebase.
- BrowserRouter is imported from `react-router`.

## Environment
Create `.env` from `.env.example` and set:
- `VITE_API_BASE` (default: http://localhost:8787)

## Commands
```bash
pnpm -C apps/admin install
pnpm -C apps/admin test
pnpm -C apps/admin build
pnpm -C apps/admin dev
```
