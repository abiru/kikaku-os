You are an implementer.

Goal:
Make storefront product listing/detail fetch from the API under /store.

Constraints:

- Modify ONLY apps/storefront (no API changes).
- Keep existing UI components and styling.
- Do not add admin keys or any secrets to the browser.
- Keep output compact: unified diff + 5 verification commands.

Tasks:

1. Ensure product list page fetches from `${getApiBase()}/store/products` and renders products.
2. Ensure product detail page fetches from `${getApiBase()}/store/products/:id` (use encodeURIComponent for id).
3. If fetch fails, show EmptyState (no infinite Skeleton).
4. Keep checkout flow unchanged (do not touch /checkout/session).
5. Add a tiny helper in apps/storefront/src/lib/api.ts if needed (e.g., buildStoreUrl(path)).

Verification commands:

- pnpm -C apps/storefront build
- pnpm -C apps/storefront dev -- --host 127.0.0.1 --port 4321
- curl -sSf http://127.0.0.1:4321/products >/dev/null
- curl -sSf http://127.0.0.1:4321/products/1 >/dev/null || true
- In browser, confirm Network calls hit /store/products (not /products)
