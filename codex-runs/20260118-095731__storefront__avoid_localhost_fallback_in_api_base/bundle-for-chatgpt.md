# Codex run
- title: storefront: avoid localhost fallback in api base
- generated: 2026-01-18T09:58:35+09:00
- branch: main
- head: 716ff6c

## Repo context
=== Codex Context (short) ===
2026-01-18T09:57:46+09:00

## Repo
branch: main
head:   716ff6c

## Status
## main...origin/main [ahead 5]
?? codex-runs/20260118-095731__storefront__avoid_localhost_fallback_in_api_base/
?? prompts/
?? scripts/

## Changed files (HEAD..WT)

## Diff stats (HEAD..WT)

## Recent commits
716ff6c storefront: revamp layout, product pages, and UI components
f97a48b codex-run: storefront: review layout and product page changes
c464b69 codex-run: storefront: diagnostic verification plan for storefront changes
569f8b7 codex-run: storefront: revamp product pages and ui components
098320e codex-run: storefront: codex-run
fe3c267 storefront
e8cddbe first commit

_(full context: codex-runs/20260118-095731__storefront__avoid_localhost_fallback_in_api_base/context.txt)_

## Prompt (what I gave to codex)
```
Fix the PUBLIC_API_BASE fallback safely.
Change only apps/storefront/src/lib/api.ts.
Goal: never default to http://localhost:8787 in production client code.
Prefer: env base > (if window) window.location.origin > safe SSR fallback (relative or explicit error).
Return a unified diff patch + 3 verification steps.
Keep everything compact.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-095731__storefront__avoid_localhost_fallback_in_api_base/prompt.md)
```

## Codex output
```
Removed the hardcoded localhost fallback in `apps/storefront/src/lib/api.ts` so `getApiBase` now prefers env, then browser origin, and otherwise fails explicitly in SSR instead of silently targeting a dev host.

```diff
diff --git a/apps/storefront/src/lib/api.ts b/apps/storefront/src/lib/api.ts
index 6f9e827..eab4e6e 100644
--- a/apps/storefront/src/lib/api.ts
+++ b/apps/storefront/src/lib/api.ts
@@ -1,5 +1,3 @@
-const DEFAULT_API_BASE = 'http://localhost:8787';
-
 type FetchOptions = RequestInit & { parseJson?: boolean };
 
 export const getApiBase = () => {
@@ -13,7 +11,11 @@ export const getApiBase = () => {
 		return envBase;
 	}
 
-	return DEFAULT_API_BASE;
+	if (typeof window !== 'undefined' && window.location?.origin) {
+		return window.location.origin;
+	}
+
+	throw new Error('PUBLIC_API_BASE is not set and window is unavailable');
 };
 
 export const fetchJson = async <T = unknown>(url: string, options: FetchOptions = {}) => {
```

**Verification Steps**
- `pnpm -C apps/admin test`
- `pnpm -C apps/api test`
- `pnpm -C apps/storefront build`

Not run here.

... (output truncated in bundle; full output: codex-runs/20260118-095731__storefront__avoid_localhost_fallback_in_api_base/codex-output.md)
```

