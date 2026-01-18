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
