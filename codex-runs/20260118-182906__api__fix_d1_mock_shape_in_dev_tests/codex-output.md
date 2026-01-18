```diff
diff --git a/apps/api/src/routes/dev.test.ts b/apps/api/src/routes/dev.test.ts
index 3953f04..1cc94c8 100644
--- a/apps/api/src/routes/dev.test.ts
+++ b/apps/api/src/routes/dev.test.ts
@@ -18,34 +18,41 @@ const createMockDb = (options: {
   missingMappingCount?: number;
 }) => {
   const calls: { sql: string; bind: unknown[] }[] = [];
+  const createStatement = (sql: string) => {
+    const state = { sql, bindArgs: [] as unknown[] };
+    const statement = {
+      bind: (...args: unknown[]) => {
+        state.bindArgs = args;
+        return statement;
+      },
+      all: async () => {
+        if (sql.includes('JOIN prices pr') && sql.includes('COALESCE(TRIM(pr.provider_price_id)')) {
+          return { results: options.candidates ?? [] };
+        }
+        if (sql.includes('LEFT JOIN prices')) {
+          const count = options.missingMappingCount ?? 0;
+          return {
+            results: Array.from({ length: count }, (_, index) => ({ variant_id: index + 1 }))
+          };
+        }
+        return { results: [] };
+      },
+      first: async () => {
+        if (sql.includes('COUNT(*)')) {
+          return { count: options.configuredCount ?? 0 };
+        }
+        return null;
+      },
+      run: async () => {
+        calls.push({ sql: state.sql, bind: state.bindArgs });
+        return { success: true };
+      }
+    };
+    return statement;
+  };
   return {
     calls,
-    prepare: (sql: string) => ({
-      bind: (...args: unknown[]) => ({
-        all: async () => {
-          if (sql.includes('JOIN prices pr') && sql.includes('COALESCE(TRIM(pr.provider_price_id)')) {
-            return { results: options.candidates ?? [] };
-          }
-          if (sql.includes('LEFT JOIN prices')) {
-            const count = options.missingMappingCount ?? 0;
-            return {
-              results: Array.from({ length: count }, (_, index) => ({ variant_id: index + 1 }))
-            };
-          }
-          return { results: [] };
-        },
-        first: async () => {
-          if (sql.includes('COUNT(*)')) {
-            return { count: options.configuredCount ?? 0 };
-          }
-          return null;
-        },
-        run: async () => {
-          calls.push({ sql, bind: args });
-          return { meta: { last_row_id: 1, changes: 1 } };
-        }
-      })
-    })
+    prepare: (sql: string) => createStatement(sql)
   };
 };
```

```
pnpm -C apps/api test
pnpm -C apps/api test src/routes/dev.test.ts
rg -n "provision-stripe-prices" apps/api/src/routes/dev.ts apps/api/src/routes/dev.test.ts
git diff --stat
git status --short
```
