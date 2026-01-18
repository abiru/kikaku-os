Fix the PUBLIC_API_BASE fallback safely.
Change only apps/storefront/src/lib/api.ts.
Goal: never default to http://localhost:8787 in production client code.
Prefer: env base > (if window) window.location.origin > safe SSR fallback (relative or explicit error).
Return a unified diff patch + 3 verification steps.
Keep everything compact.
