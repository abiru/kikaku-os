Updated storefront product fetching to use a `/store` URL helper with encoded IDs, and switched failure UI to `EmptyState` on list/detail pages (checkout flow untouched). Not run; here are the verification commands you requested.

```diff
diff --git a/apps/storefront/src/lib/api.ts b/apps/storefront/src/lib/api.ts
index eab4e6e..7ef8ee0 100644
--- a/apps/storefront/src/lib/api.ts
+++ b/apps/storefront/src/lib/api.ts
@@ -18,6 +18,16 @@ export const getApiBase = () => {
 	throw new Error('PUBLIC_API_BASE is not set and window is unavailable');
 };
 
+export const buildStoreUrl = (path: string, base: string = getApiBase()) => {
+	const normalizedBase = base.replace(/\/+$/, '');
+	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
+	const storePath = normalizedPath === '/store' || normalizedPath.startsWith('/store/')
+		? normalizedPath
+		: `/store${normalizedPath}`;
+
+	return `${normalizedBase}${storePath}`;
+};
+
 export const fetchJson = async <T = unknown>(url: string, options: FetchOptions = {}) => {
 	const { parseJson = true, ...fetchOptions } = options;
 	const res = await fetch(url, fetchOptions);
diff --git a/apps/storefront/src/pages/products/[id].astro b/apps/storefront/src/pages/products/[id].astro
index e5706d9..2b95c62 100644
--- a/apps/storefront/src/pages/products/[id].astro
+++ b/apps/storefront/src/pages/products/[id].astro
@@ -5,17 +5,18 @@ import Button from '../../components/Button.astro';
 import Container from '../../components/Container.astro';
 import EmptyState from '../../components/EmptyState.astro';
 import Layout from '../../layouts/Layout.astro';
-import { fetchJson, getApiBase } from '../../lib/api';
+import { buildStoreUrl, fetchJson, getApiBase } from '../../lib/api';
 
 const apiBase = getApiBase();
 const { id } = Astro.params;
+const encodedId = encodeURIComponent(id);
 export const prerender = false;
 
 let product: any = null;
 let loadState: 'ready' | 'not-found' | 'unavailable' = 'ready';
 
 try {
-	const data = await fetchJson(`${apiBase}/store/products/${id}`);
+	const data = await fetchJson(buildStoreUrl(`/products/${encodedId}`, apiBase));
 	product = data?.product ?? null;
 	if (!product) {
 		loadState = 'not-found';
@@ -126,15 +127,12 @@ const stockNote =
 				</section>
 			) : loadState === 'unavailable' ? (
 				<div class="mt-8">
-					<Alert
-						severity="critical"
+					<EmptyState
 						title="Product unavailable"
 						description="We couldn't load this product. Please retry in a moment."
-					>
-						<Button href={`/products/${id}`} variant="secondary" size="sm">
-							Retry
-						</Button>
-					</Alert>
+						ctaLabel="Retry"
+						ctaHref={`/products/${encodedId}`}
+					/>
 				</div>
 			) : (
 				<div class="mt-8">
diff --git a/apps/storefront/src/pages/products/index.astro b/apps/storefront/src/pages/products/index.astro
index 92630e4..c1b0803 100644
--- a/apps/storefront/src/pages/products/index.astro
+++ b/apps/storefront/src/pages/products/index.astro
@@ -1,14 +1,10 @@
 ---
-import Alert from '../../components/Alert.astro';
 import Badge from '../../components/Badge.astro';
-import Button from '../../components/Button.astro';
 import Container from '../../components/Container.astro';
 import EmptyState from '../../components/EmptyState.astro';
 import Skeleton from '../../components/Skeleton.astro';
 import Layout from '../../layouts/Layout.astro';
-import { getApiBase } from '../../lib/api';
 
-const apiBase = getApiBase();
 const skeletonCards = Array.from({ length: 9 });
 ---
 
@@ -24,7 +20,7 @@ const skeletonCards = Array.from({ length: 9 });
 				<Badge severity="info">Live catalog</Badge>
 			</div>
 
-			<div id="product-state" data-api-base={apiBase} class="mt-8 space-y-6">
+			<div id="product-state" class="mt-8 space-y-6">
 				<div id="product-skeleton" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
 					{skeletonCards.map(() => (
 						<div class="rounded-2xl border border-zinc-200 bg-white shadow-sm">
@@ -41,16 +37,12 @@ const skeletonCards = Array.from({ length: 9 });
 				</div>
 
 				<div id="product-error" class="hidden">
-					<Alert
-						severity="critical"
+					<EmptyState
 						title="Couldn't load products"
 						description="The catalog is unavailable right now. Please retry."
-					>
-						<div class="flex items-center gap-3">
-							<Button id="retry-products" variant="secondary" size="sm">Retry</Button>
-							<p id="product-error-message" class="text-sm text-red-800"></p>
-						</div>
-					</Alert>
+						ctaLabel="Retry"
+						ctaHref="/products"
+					/>
 				</div>
 
 				<div id="product-empty" class="hidden">
@@ -68,16 +60,13 @@ const skeletonCards = Array.from({ length: 9 });
 	</section>
 
 	<script>
-		import { fetchJson } from '../../lib/api';
+		import { buildStoreUrl, fetchJson, getApiBase } from '../../lib/api';
 
-		const state = document.getElementById('product-state');
-		const apiBase = state?.dataset.apiBase || 'http://localhost:8787';
+		const apiBase = getApiBase();
 		const skeleton = document.getElementById('product-skeleton');
 		const errorState = document.getElementById('product-error');
 		const emptyState = document.getElementById('product-empty');
 		const grid = document.getElementById('product-grid');
-		const retryButton = document.getElementById('retry-products');
-		const errorMessage = document.getElementById('product-error-message');
 
 		const setState = (next) => {
 			const isLoading = next === 'loading';
@@ -151,10 +140,9 @@ const skeletonCards = Array.from({ length: 9 });
 
 		const loadProducts = async () => {
 			setState('loading');
-			if (errorMessage) errorMessage.textContent = '';
 
 			try {
-				const data = await fetchJson(`${apiBase}/store/products`);
+				const data = await fetchJson(buildStoreUrl('/products', apiBase));
 				const products = Array.isArray(data?.products) ? data.products.filter(isProduct) : [];
 
 				if (!products.length) {
@@ -165,15 +153,10 @@ const skeletonCards = Array.from({ length: 9 });
 				renderProducts(products);
 				setState('loaded');
 			} catch (error) {
-				if (errorMessage) {
-					errorMessage.textContent =
-						error instanceof Error ? error.message : 'Unable to load products.';
-				}
 				setState('error');
 			}
 		};
 
-		retryButton?.addEventListener('click', () => loadProducts());
 		loadProducts();
 	</script>
 </Layout>
```

```sh
pnpm -C apps/storefront build
pnpm -C apps/storefront dev -- --host 127.0.0.1 --port 4321
curl -sSf http://127.0.0.1:4321/products >/dev/null
curl -sSf http://127.0.0.1:4321/products/1 >/dev/null || true
# In browser, confirm Network calls hit /store/products (not /products)
```
