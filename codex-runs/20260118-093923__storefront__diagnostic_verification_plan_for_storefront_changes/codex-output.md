**Commands**
```sh
rg -n "export const prerender = false" "apps/storefront/src/pages/products/[id].astro" # success: route file exists and is SSR-only
rg -n "loadProducts|fetchJson" apps/storefront/src/pages/products/index.astro # success: client-side loader script is present
rg -n "styles/global.css|px-4|py-10|py-12|px-3|py-2" apps/storefront/src/layouts/Layout.astro apps/storefront/src/components/Container.astro apps/storefront/src/styles/global.css # success: padding + global.css wiring show up
pnpm -C apps/storefront build # success: Astro build completes
pnpm -C apps/storefront preview --host 127.0.0.1 --port 4321 > /tmp/astro-preview.log 2>&1 & echo $! > /tmp/astro-preview.pid; sleep 1 # success: preview starts and PID saved
curl -fsS http://127.0.0.1:4321/products | rg -n "product-state|product-skeleton" # success: /products HTML includes client-render skeleton
curl -fsS http://127.0.0.1:4321/products/placeholder | rg -n "Product unavailable|Product not found|product-detail" # success: /products/[id] renders without backend
kill $(cat /tmp/astro-preview.pid) # success: preview process stops
pnpm -C apps/storefront test # success: vitest run passes
```

**Failure Follow-ups**
- If preview or curls fail, inspect `/tmp/astro-preview.log` for bundling/port errors.
- If /products lacks skeleton IDs, confirm the `<script>` block and `#product-state` remain in `apps/storefront/src/pages/products/index.astro`.
- If /products/placeholder fails, verify `export const prerender = false` and fetch error handling in `apps/storefront/src/pages/products/[id].astro`.
- If padding grep shows nothing or layout looks off, verify `../styles/global.css` import in `apps/storefront/src/layouts/Layout.astro` and `px-*` in `apps/storefront/src/components/Container.astro`.
- If vitest fails to start or finds 0 tests, check `apps/storefront/src/lib/api.test.ts` and `apps/storefront/package.json`.
