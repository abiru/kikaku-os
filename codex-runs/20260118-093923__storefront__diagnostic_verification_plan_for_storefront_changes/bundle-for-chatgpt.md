# Codex run
- title: storefront: diagnostic verification plan for storefront changes
- generated: 2026-01-18T09:43:54+09:00
- branch: main
- head: 569f8b7

## Repo context
=== Codex Context (short) ===
2026-01-18T09:39:30+09:00

## Repo
branch: main
head:   569f8b7

## Status
## main...origin/main [ahead 2]
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
?? codex-runs/20260118-093707__storefront__review_layout_and_product_page_changes/
?? codex-runs/20260118-093923__storefront__diagnostic_verification_plan_for_storefront_changes/
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
569f8b7 codex-run: storefront: revamp product pages and ui components
098320e codex-run: storefront: codex-run
fe3c267 storefront
e8cddbe first commit

## Prompt (what I gave to codex)
```
Create a minimal verification plan that is diagnostic (helps pinpoint failures quickly).
Deliver:

- 5-10 ordered shell commands (copy/paste ready).
- After each command, add a short success criterion (1 clause).
- Add up to 5 failure-mode follow-ups (1 line each).
  Focus on: Astro build/preview, client-only rendering regressions on /products, routing for /products/[id], global.css/layout padding effects, vitest wiring.
  Constraints: no long prose; each step <= 1 line explanation. No assumptions about backend/Stripe availability.
```

## Codex output
```
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
```

## Ask
- 上の内容を踏まえて、次にCodexへ投げるプロンプト案を3つ作って。
- それぞれ「目的」「期待する出力」「注意点（長文回避）」を含めて。
