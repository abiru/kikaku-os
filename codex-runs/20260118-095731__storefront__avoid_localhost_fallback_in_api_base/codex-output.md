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
