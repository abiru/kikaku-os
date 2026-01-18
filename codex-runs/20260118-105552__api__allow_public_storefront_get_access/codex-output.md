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
