# Codex run
- title: api: allow public storefront get access
- generated: 2026-01-18T10:56:32+09:00
- branch: main
- head: 1452b1a

## Repo context
=== Codex Context (short) ===
2026-01-18T10:56:02+09:00

## Repo
branch: main
head:   1452b1a

## Status
## main...origin/main [ahead 8]
 M prompts/prompt.md
?? codex-runs/20260118-105552__api__allow_public_storefront_get_access/

## Changed files (HEAD..WT)
prompts/prompt.md

## Diff stats (HEAD..WT)
 prompts/prompt.md | 31 +++++++++++++++++++++++++------
 1 file changed, 25 insertions(+), 6 deletions(-)

## Recent commits
1452b1a chore: improve codex-run script and prompts
ff7bdea storefront: avoid localhost fallback in api base
28ae5ea codex-run: storefront: avoid localhost fallback in api base
716ff6c storefront: revamp layout, product pages, and UI components
f97a48b codex-run: storefront: review layout and product page changes
c464b69 codex-run: storefront: diagnostic verification plan for storefront changes
569f8b7 codex-run: storefront: revamp product pages and ui components
098320e codex-run: storefront: codex-run
fe3c267 storefront
e8cddbe first commit

_(full context: codex-runs/20260118-105552__api__allow_public_storefront_get_access/context.txt)_

## Prompt (what I gave to codex)
```
You are a strict engineer. Update apps/api/src/index.ts to make storefront product browsing public WITHOUT exposing admin access.

Context:

- app.route('/store', storefront) exists.
- Current auth gate requires x-admin-key for most routes, but should NOT block storefront browsing.
- DO NOT add x-admin-key to the storefront.
- Keep admin routes protected as-is.

Task:

1. Modify ONLY apps/api/src/index.ts.
2. Allow requests under /store/ to pass the auth gate.
   - Preferred: allow only GET for /store/ (leave POST protected).
3. Keep existing exceptions for /webhooks/stripe and /checkout/session.
4. Return a unified diff patch.
5. Provide 3 verification commands (curl-based) that confirm:
   - GET /store/products returns 200 without x-admin-key
   - GET /reports (or another admin-protected route) still returns 401 without x-admin-key
   - GET /store/products still works when Origin is http://127.0.0.1:4321 (CORS)

Constraints:

- Keep output compact.
- No broad advice, no refactors, no new files.

... (prompt truncated in bundle; full prompt: codex-runs/20260118-105552__api__allow_public_storefront_get_access/prompt.md)
```

## Codex output
```
Allowed only GET requests under `/store` to bypass the admin-key gate while keeping all admin routes and existing exceptions unchanged in `apps/api/src/index.ts`.

```diff
diff --git a/apps/api/src/index.ts b/apps/api/src/index.ts
index 943a8dc..cd4ce0d 100644
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@ -46,7 +46,12 @@ app.use('*', async (c, next) => {
   if (c.req.method === 'OPTIONS') return c.body(null, 204);
   if (c.req.path.startsWith('/webhooks/stripe')) return next();
   if (c.req.path.startsWith('/checkout/session')) return next();
-  if (c.req.path.startsWith('/store/products')) return next();
+  if (
+    c.req.method === 'GET' &&
+    (c.req.path === '/store' || c.req.path.startsWith('/store/'))
+  ) {
+    return next();
+  }
   const key = c.req.header('x-admin-key');
   if (!key || key !== c.env.ADMIN_API_KEY) return jsonError(c, 'Unauthorized', 401);
   await next();
```

Verification commands:
```bash
curl -i http://localhost:8787/store/products
curl -i http://localhost:8787/reports
curl -i -H "Origin: http://127.0.0.1:4321" http://localhost:8787/store/products
```

... (output truncated in bundle; full output: codex-runs/20260118-105552__api__allow_public_storefront_get_access/codex-output.md)
```

