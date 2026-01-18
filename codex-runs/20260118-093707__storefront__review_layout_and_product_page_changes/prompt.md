Act as a strict diff-based reviewer. Re-evaluate the previous risk list, but ONLY if you can point to concrete evidence in the current working tree.
Deliver:

1. Risk list with severity (S/A/B). Each item must include: file path(s), one 1-2 line code snippet as evidence, and the failure mode.
2. Up to 3 minimal patch suggestions (what to change + where).
3. Up to 5 “blast radius” checks to run on untouched pages due to Layout/global.css changes.
   Constraints: each bullet <= 2 lines. No assumptions about Stripe/API. No broad advice.
   Target files: Layout.astro, global.css, pages/_, components/_, vitest.config.ts, package.json/pnpm-lock.
