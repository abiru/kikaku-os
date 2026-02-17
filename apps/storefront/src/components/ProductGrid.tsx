import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { buildStoreUrl, fetchJson, getApiBase } from '../lib/api';
import { $wishlistItems, toggleWishlist, type WishlistItem } from '../lib/wishlist';
import { useTranslation } from '../i18n';
import { ProductCardReact, ProductCardSkeletonReact } from './ui/ProductCardReact';

type VariantListItem = {
	id: number;
	title?: string;
	price?: { amount: number; currency: string };
	stock?: number | null;
};

type ProductListItem = {
	id: number;
	title: string;
	image?: string;
	tax_rate?: number;
	variants?: VariantListItem[];
};

type PageMeta = {
	page: number;
	perPage: number;
	totalCount: number;
	totalPages: number;
};

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';
type ErrorInfo = { title: string; description: string };

function WishlistHeart({ product }: { product: ProductListItem }) {
	const wishlistItems = useStore($wishlistItems);
	const productId = Number(product.id);
	const isWishlisted = !!wishlistItems[String(productId)];
	const variant = Array.isArray(product.variants) ? product.variants[0] : null;

	const handleToggle = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const item: Omit<WishlistItem, 'addedAt'> = {
			productId,
			title: String(product.title ?? ''),
			price: variant?.price?.amount ?? 0,
			currency: variant?.price?.currency ?? 'JPY',
			taxRate: product.tax_rate ?? 0.10,
			imageUrl: product.image || undefined,
			variantId: variant?.id,
			variantTitle: variant?.title || 'Default',
		};
		toggleWishlist(item);
	};

	return (
		<button
			type="button"
			onClick={handleToggle}
			className="absolute top-3 right-3 z-10 rounded-full bg-white/80 p-2 backdrop-blur-sm shadow-sm transition-all duration-200 hover:scale-110 active:scale-95"
			aria-label="お気に入り"
		>
			{isWishlisted ? (
				<svg className="size-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
					<path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"/>
				</svg>
			) : (
				<svg className="size-5 text-neutral-400 hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
					<path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
				</svg>
			)}
		</button>
	);
}

function Pagination({
	meta,
	t,
}: {
	meta: PageMeta;
	t: (key: string, params?: Record<string, string>) => string;
}) {
	const { page, perPage, totalCount, totalPages } = meta;
	const start = (page - 1) * perPage + 1;
	const end = Math.min(page * perPage, totalCount);

	const buildPageUrl = (newPage: number): string => {
		const params = new URLSearchParams(window.location.search);
		params.set('page', String(newPage));
		return `?${params.toString()}`;
	};

	const pageNumbers: number[] = [];
	const maxVisible = 5;
	let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
	const endPage = Math.min(totalPages, startPage + maxVisible - 1);
	startPage = Math.max(1, endPage - maxVisible + 1);
	for (let i = startPage; i <= endPage; i++) {
		pageNumbers.push(i);
	}

	return (
		<nav className="mt-12 flex flex-col items-center gap-4 border-t border-neutral-200 pt-6" aria-label={t('products.pagination')}>
			<p className="text-sm text-secondary">
				{t('products.showingCount')
					.replace('{start}', String(start))
					.replace('{end}', String(end))
					.replace('{total}', String(totalCount))}
			</p>
			<div className="flex items-center gap-1">
				{page > 1 && (
					<a
						href={buildPageUrl(page - 1)}
						className="px-3 py-2 text-sm font-medium text-primary bg-white rounded-lg ring-1 ring-neutral-200 hover:bg-subtle transition-colors"
					>
						&larr;
					</a>
				)}
				{pageNumbers.map((p) => (
					<a
						key={p}
						href={p === page ? undefined : buildPageUrl(p)}
						aria-current={p === page ? 'page' : undefined}
						className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
							p === page
								? 'bg-brand text-white'
								: 'text-primary bg-white ring-1 ring-neutral-200 hover:bg-subtle'
						}`}
					>
						{p}
					</a>
				))}
				{page < totalPages && (
					<a
						href={buildPageUrl(page + 1)}
						className="px-3 py-2 text-sm font-medium text-primary bg-white rounded-lg ring-1 ring-neutral-200 hover:bg-subtle transition-colors"
					>
						&rarr;
					</a>
				)}
			</div>
		</nav>
	);
}

export default function ProductGrid() {
	const { t } = useTranslation();
	const [state, setState] = useState<LoadState>('loading');
	const [products, setProducts] = useState<ProductListItem[]>([]);
	const [meta, setMeta] = useState<PageMeta | null>(null);
	const [errorInfo, setErrorInfo] = useState<ErrorInfo>({ title: '', description: '' });
	const liveRegionRef = useRef<HTMLDivElement>(null);

	const loadProducts = useCallback(async () => {
		setState('loading');
		const apiBase = getApiBase();
		const urlParams = new URLSearchParams(window.location.search);

		try {
			const params = new URLSearchParams();
			const searchQuery = urlParams.get('q');
			const category = urlParams.get('category');
			const minPrice = urlParams.get('minPrice');
			const maxPrice = urlParams.get('maxPrice');
			const sort = urlParams.get('sort');
			const page = urlParams.get('page') || '1';

			if (searchQuery) params.set('q', searchQuery);
			if (category) params.set('category', category);
			if (minPrice) params.set('minPrice', minPrice);
			if (maxPrice) params.set('maxPrice', maxPrice);
			if (sort) params.set('sort', sort);
			params.set('page', page);

			const queryString = params.toString();
			const url = buildStoreUrl(queryString ? `/products?${queryString}` : '/products', apiBase);
			const data = await fetchJson<{ products?: unknown[]; meta?: PageMeta | null }>(url);

			const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
			const isProduct = (v: unknown): v is ProductListItem => isRecord(v) && 'id' in v && 'title' in v;
			const validProducts = Array.isArray(data?.products) ? data.products.filter(isProduct) : [];

			if (validProducts.length === 0) {
				setState('empty');
				return;
			}

			setProducts(validProducts);
			setMeta(data?.meta ?? null);
			setState('loaded');

			if (liveRegionRef.current) {
				const template = t('products.announceCount') || '{count}件の商品が見つかりました';
				liveRegionRef.current.textContent = template.replace('{count}', String(validProducts.length));
			}
		} catch (err) {
			const status = (err as { status?: number }).status;
			if (status === 404) {
				setErrorInfo({ title: t('errors.notFoundError'), description: t('errors.notFoundErrorDescription') });
			} else if (status && status >= 500) {
				setErrorInfo({ title: t('errors.serverError'), description: t('errors.serverErrorDescription') });
			} else if (!status) {
				setErrorInfo({ title: t('errors.networkError'), description: t('errors.networkErrorDescription') });
			} else {
				setErrorInfo({ title: t('errors.storeUnavailable'), description: t('errors.storeUnavailableDescription') });
			}
			setState('error');
		}
	}, [t]);

	useEffect(() => {
		loadProducts();
	}, [loadProducts]);

	if (state === 'loading') {
		return (
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8">
				{Array.from({ length: 6 }).map((_, i) => (
					<ProductCardSkeletonReact key={i} />
				))}
			</div>
		);
	}

	if (state === 'error') {
		return (
			<div className="py-20">
				<div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8">
					<div className="mx-auto max-w-md text-center">
						<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-light text-danger">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
							</svg>
						</div>
						<h2 className="mt-4 text-lg font-semibold text-primary">{errorInfo.title}</h2>
						<p className="mt-2 text-sm text-secondary">{errorInfo.description}</p>
						<div className="mt-6 flex justify-center">
							<button
								type="button"
								onClick={loadProducts}
								className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-subtle transition-colors"
							>
								<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
								</svg>
								{t('errors.retry')}
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (state === 'empty') {
		return (
			<div className="py-20 text-center">
				<svg className="mx-auto h-12 w-12 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
					<path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
				</svg>
				<h3 className="mt-4 text-lg font-medium text-primary">{t('products.noProducts')}</h3>
				<p className="mt-2 text-sm text-secondary">{t('products.noProductsDescription')}</p>
				<div className="mt-6">
					<a href="/products" className="inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-active transition-colors">
						{t('products.viewAllProducts')}
					</a>
				</div>
			</div>
		);
	}

	return (
		<>
			<div ref={liveRegionRef} aria-live="polite" role="status" className="sr-only" />
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8">
				{products.map((product) => {
					const variant = Array.isArray(product.variants) ? product.variants[0] : null;
					const badge = t('products.new');
					const stock = variant?.stock ?? 0;
					const badgeColor = stock > 0 ? 'success' : 'brand';

					return (
						<div key={product.id} className="relative">
							<WishlistHeart product={product} />
							<ProductCardReact
								id={product.id}
								title={product.title}
								image={product.image}
								price={variant?.price?.amount}
								currency={variant?.price?.currency || 'JPY'}
								badge={badge}
								badgeColor={badgeColor as 'success' | 'brand'}
							/>
						</div>
					);
				})}
			</div>
			{meta && meta.totalPages > 1 && <Pagination meta={meta} t={t} />}
		</>
	);
}
