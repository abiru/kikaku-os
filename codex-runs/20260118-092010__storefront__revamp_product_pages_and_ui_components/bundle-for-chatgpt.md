# Codex run
- title: storefront: revamp product pages and ui components
- generated: 2026-01-18T09:28:26+09:00
- branch: main
- head: 098320e

## Repo context
=== Codex Context (short) ===
2026-01-18T09:20:18+09:00

## Repo
branch: main
head:   098320e

## Status
## main...origin/main [ahead 1]
 M apps/storefront/package.json
 M apps/storefront/pnpm-lock.yaml
 M apps/storefront/src/layouts/Layout.astro
 M apps/storefront/src/pages/checkout/cancel.astro
 M apps/storefront/src/pages/checkout/success.astro
 M apps/storefront/src/pages/index.astro
 M apps/storefront/src/pages/products/[id].astro
 M apps/storefront/src/pages/products/index.astro
 M apps/storefront/src/styles/global.css
?? apps/storefront/src/components/Alert.astro
?? apps/storefront/src/components/Badge.astro
?? apps/storefront/src/components/Button.astro
?? apps/storefront/src/components/Container.astro
?? apps/storefront/src/components/EmptyState.astro
?? apps/storefront/src/components/Skeleton.astro
?? apps/storefront/src/lib/
?? apps/storefront/vitest.config.ts
?? codex-input.txt
?? codex-runs/20260118-092010__storefront__revamp_product_pages_and_ui_components/
?? git-report.txt
?? prompts/
?? scripts/

## Changed files (HEAD..WT)
apps/storefront/package.json
apps/storefront/pnpm-lock.yaml
apps/storefront/src/layouts/Layout.astro
apps/storefront/src/pages/checkout/cancel.astro
apps/storefront/src/pages/checkout/success.astro
apps/storefront/src/pages/index.astro
apps/storefront/src/pages/products/[id].astro
apps/storefront/src/pages/products/index.astro
apps/storefront/src/styles/global.css

## Diff stats (HEAD..WT)
 apps/storefront/package.json                     |   8 +-
 apps/storefront/pnpm-lock.yaml                   | 731 +++++++++++++++++++++++
 apps/storefront/src/layouts/Layout.astro         |  25 +-
 apps/storefront/src/pages/checkout/cancel.astro  |  35 +-
 apps/storefront/src/pages/checkout/success.astro |  17 +-
 apps/storefront/src/pages/index.astro            |  22 +-
 apps/storefront/src/pages/products/[id].astro    | 279 ++++++---
 apps/storefront/src/pages/products/index.astro   | 196 ++++--
 apps/storefront/src/styles/global.css            |  17 +
 9 files changed, 1148 insertions(+), 182 deletions(-)

## Recent commits
098320e codex-run: storefront: codex-run
fe3c267 storefront
e8cddbe first commit

## Prompt (what I gave to codex)
```
Act as a reviewer. Based on the working tree changes in apps/storefront, identify risks and propose a minimal verification plan.

Deliverable:

1. Top 10 risk items (each: file(s), failure mode, why likely)
2. Minimal verification steps (5-10 steps, ordered, copy/paste ready commands)
3. If you were to add tests, list 5 test cases (title + what to assert + where to place)

Rules:

- Keep each bullet under 2 lines.
- No broad advice; tie every item to the file list: Layout.astro, global.css, pages/_, components/_, vitest config, package.json/pnpm-lock.
- Avoid assumptions about Stripe/API; focus on storefront behavior and build.
```

## Codex output
```
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
```

## Ask
- 上の内容を踏まえて、次にCodexへ投げるプロンプト案を3つ作って。
- それぞれ「目的」「期待する出力」「注意点（長文回避）」を含めて。
