Act as a reviewer. Based on the working tree changes in apps/storefront, identify risks and propose a minimal verification plan.

Deliverable:

1. Top 10 risk items (each: file(s), failure mode, why likely)
2. Minimal verification steps (5-10 steps, ordered, copy/paste ready commands)
3. If you were to add tests, list 5 test cases (title + what to assert + where to place)

Rules:

- Keep each bullet under 2 lines.
- No broad advice; tie every item to the file list: Layout.astro, global.css, pages/_, components/_, vitest config, package.json/pnpm-lock.
- Avoid assumptions about Stripe/API; focus on storefront behavior and build.
