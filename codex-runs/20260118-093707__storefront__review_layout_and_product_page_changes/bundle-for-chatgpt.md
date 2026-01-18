# Codex run
- title: storefront: review layout and product page changes
- generated: 2026-01-18T09:45:34+09:00
- branch: main
- head: c464b69

## Repo context
=== Codex Context (short) ===
2026-01-18T09:37:14+09:00

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
Act as a strict diff-based reviewer. Re-evaluate the previous risk list, but ONLY if you can point to concrete evidence in the current working tree.
Deliver:

1. Risk list with severity (S/A/B). Each item must include: file path(s), one 1-2 line code snippet as evidence, and the failure mode.
2. Up to 3 minimal patch suggestions (what to change + where).
3. Up to 5 “blast radius” checks to run on untouched pages due to Layout/global.css changes.
   Constraints: each bullet <= 2 lines. No assumptions about Stripe/API. No broad advice.
   Target files: Layout.astro, global.css, pages/_, components/_, vitest.config.ts, package.json/pnpm-lock.
```

## Codex output
```
**Risks**
- A — `apps/storefront/src/lib/api.ts`  
  Evidence: `const DEFAULT_API_BASE = 'http://localhost:8787';`  
  Failure mode: if `PUBLIC_API_BASE` is missing at build, client fetches/checkout default to localhost and fail in production.
- B — `apps/storefront/package.json`  
  Evidence: `"vitest": "^1.6.0"`  
  Failure mode: test runner ships in production installs, increasing install size and potentially impacting deploy/cold-start time.

**Patch Suggestions**
- In `apps/storefront/src/lib/api.ts`, when no env base is set and `window` exists, return `window.location.origin` instead of `http://localhost:8787`.
- In `apps/storefront/package.json`, move `vitest` from `dependencies` to a new `devDependencies` block.

**Blast Radius Checks (Layout/global.css)**
- Open `apps/storefront/src/pages/index.astro` to confirm `main` padding + `Container` don’t create double top/bottom spacing.
- Open `apps/storefront/src/pages/checkout/success.astro` to verify centered card width and button focus ring styling.
- Open `apps/storefront/src/pages/checkout/cancel.astro` to verify secondary button styles with new focus-visible rules.
- Open `apps/storefront/src/pages/products/index.astro` to confirm header flex + badge alignment with new `main` padding.
- Open `apps/storefront/src/pages/products/[id].astro` to confirm `select`/`input` styles from `global.css` render correctly inside the form card.
```

## Ask
- 上の内容を踏まえて、次にCodexへ投げるプロンプト案を3つ作って。
- それぞれ「目的」「期待する出力」「注意点（長文回避）」を含めて。
