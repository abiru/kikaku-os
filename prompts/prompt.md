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
