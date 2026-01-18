**Risks**
- `apps/storefront/src/pages/products/[id].astro`: checkout now uses client `getApiBase()`; if `PUBLIC_API_BASE` is runtime-only, it falls back to localhost and checkout fails. Likely since `data-api-base` was removed.
- `apps/storefront/src/pages/products/[id].astro`: `variantId` is coerced with `Number(...)`; string/UUID IDs become `NaN`, disabling checkout. Likely if IDs aren’t strictly numeric.
- `apps/storefront/src/pages/products/[id].astro`: quantity is capped to 1–10 via `<select>` and JS guard; larger orders (previous max 99) are blocked. Likely a regression if higher quantities are valid.
- `apps/storefront/src/pages/products/index.astro`: product list is now client-only with module import; if the script fails, users see skeletons forever (no SSR fallback). Likely because rendering depends on JS.
- `apps/storefront/src/pages/products/index.astro`: links use raw `product.id` in URLs; IDs with `/` or spaces will break routing. Likely if IDs aren’t simple numbers.
- `apps/storefront/src/pages/products/index.astro` + `apps/storefront/src/components/EmptyState.astro`: state toggles depend on hardcoded IDs; future markup changes can hide all states. Likely as design tweaks continue.
- `apps/storefront/src/styles/global.css`: global control styles now apply everywhere; new `<select>`/email fields may shift sizing/layout across pages. Likely since no per-field classes remain.
- `apps/storefront/src/layouts/Layout.astro`: `main` adds padding; any page outside this diff that still has `py-*` will double-pad. Likely if other pages weren’t updated.
- `apps/storefront/src/components/Button.astro`: anchor rendering ignores `disabled`; if reused for unavailable actions, navigation still occurs. Likely if used for out-of-stock links.
- `apps/storefront/vitest.config.ts` + `apps/storefront/package.json` + `apps/storefront/pnpm-lock.yaml`: tests are node-only and not part of build; new UI logic in pages/scripts isn’t exercised by default. Likely because only `build` runs in CI.

**Open Questions / Assumptions**
- Is `PUBLIC_API_BASE` guaranteed at build time, or should `[id].astro` restore a runtime `data-api-base` for checkout?
- Are product/variant IDs strictly numeric, or should we avoid `Number(...)` coercion?
- Is the new 1–10 quantity cap intentional, or should it match the previous 1–99 range?

**Minimal Verification Steps**
```sh
pnpm -C apps/storefront install
pnpm -C apps/storefront test
pnpm -C apps/storefront build
pnpm -C apps/storefront preview -- --host 127.0.0.1 --port 4321 &
sleep 2
curl -sSf http://127.0.0.1:4321/ >/tmp/storefront-home.html
curl -sSf http://127.0.0.1:4321/products >/tmp/storefront-products.html
lsof -ti:4321 | xargs kill
```

**If Adding Tests**
- Default API base fallback — assert `getApiBase()` returns `http://localhost:8787` when env is blank — `apps/storefront/src/lib/api.test.ts`.
- fetchJson parses JSON — assert object returned for JSON body — `apps/storefront/src/lib/api.test.ts`.
- fetchJson handles non-JSON — assert raw text returned for 200 with plain text — `apps/storefront/src/lib/api.test.ts`.
- fetchJson error metadata — assert thrown error includes `status` and message from body — `apps/storefront/src/lib/api.test.ts`.
- createCheckoutSession payload — assert `fetch` called with POST JSON body for variantId/quantity/email — `apps/storefront/src/lib/api.test.ts`.

**Change Summary**
- New UI components and refreshed storefront pages with client-rendered states and updated layout (`apps/storefront/src/components/*`, `apps/storefront/src/pages/*`, `apps/storefront/src/layouts/Layout.astro`).
- Global form styling and vitest setup added (`apps/storefront/src/styles/global.css`, `apps/storefront/vitest.config.ts`, `apps/storefront/package.json`, `apps/storefront/pnpm-lock.yaml`).
