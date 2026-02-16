import DOMPurify from 'isomorphic-dompurify';
import { buildStoreUrl, fetchJson, getApiBase } from '../lib/api';
import { $wishlistItems, toggleWishlist, type WishlistItem } from '../lib/wishlist';

// Read i18n translations from data attributes
const i18nEl = document.getElementById('i18n-data');
const i18n = {
	new: i18nEl?.dataset.new || '新着',
	from: i18nEl?.dataset.from || 'から',
	buy: i18nEl?.dataset.buy || '購入',
	searchResults: i18nEl?.dataset.searchResults || '検索結果',
	filteredResults: i18nEl?.dataset.filteredResults || 'フィルター結果',
	showingCount: i18nEl?.dataset.showingCount || '{start}〜{end}件目（全{total}件）',
	pageInfo: i18nEl?.dataset.pageInfo || 'ページ {page} / {totalPages}',
	priceAbove: i18nEl?.dataset.priceAbove || '{min}円以上',
	priceUpTo: i18nEl?.dataset.priceUpTo || '{max}円以下',
	domesticShipping: i18nEl?.dataset.domesticShipping || '国内発送 2〜3日',
	internationalShipping: i18nEl?.dataset.internationalShipping || '海外発送 10日程',
	errorNetwork: i18nEl?.dataset.errorNetwork || 'ネットワークエラー',
	errorNetworkDesc: i18nEl?.dataset.errorNetworkDesc || 'インターネット接続を確認して、もう一度お試しください。',
	errorServer: i18nEl?.dataset.errorServer || 'サーバーエラー',
	errorServerDesc: i18nEl?.dataset.errorServerDesc || 'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。',
	errorNotFound: i18nEl?.dataset.errorNotFound || 'ページが見つかりません',
	errorNotFoundDesc: i18nEl?.dataset.errorNotFoundDesc || 'お探しのリソースは見つかりませんでした。',
	errorGeneric: i18nEl?.dataset.errorGeneric || 'ストアが利用できません',
	errorGenericDesc: i18nEl?.dataset.errorGenericDesc || 'カタログを読み込めませんでした。しばらくしてからもう一度お試しください。',
};

// Create aria-live region for announcing product count changes
const liveRegion = document.createElement('div');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.setAttribute('role', 'status');
liveRegion.className = 'sr-only';
document.body.appendChild(liveRegion);

const announceProductCount = (count: number) => {
	liveRegion.textContent = `${count}件の商品が見つかりました`;
};

const showError = (title: string, description: string) => {
	const errorTitle = document.getElementById('error-title');
	const errorDesc = document.getElementById('error-description');
	if (errorTitle) errorTitle.textContent = title;
	if (errorDesc) errorDesc.textContent = description;
};

const setState = (next: string) => {
	const skeleton = document.getElementById('product-skeleton');
	const errorState = document.getElementById('product-error');
	const emptyState = document.getElementById('product-empty');
	const grid = document.getElementById('product-grid');

	const isLoading = next === 'loading';
	const isError = next === 'error';
	const isEmpty = next === 'empty';
	const isLoaded = next === 'loaded';

	skeleton?.classList.toggle('hidden', !isLoading);
	errorState?.classList.toggle('hidden', !isError);
	emptyState?.classList.toggle('hidden', !isEmpty);
	grid?.classList.toggle('hidden', !isLoaded);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isProduct = (value: unknown) => isRecord(value) && 'id' in value && 'title' in value;

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
type PageMeta = { page: number; perPage: number; totalCount: number; totalPages: number };

const createWishlistHeart = (product: ProductListItem, variant: VariantListItem | null | undefined): HTMLButtonElement => {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200 hover:scale-110 active:scale-95';
	btn.setAttribute('aria-label', 'お気に入り');

	const productId = Number(product.id);
	const wishlistItem: Omit<WishlistItem, 'addedAt'> = {
		productId,
		title: String(product.title ?? ''),
		price: variant?.price?.amount ?? 0,
		currency: variant?.price?.currency ?? 'JPY',
		taxRate: product.tax_rate ?? 0.10,
		imageUrl: product.image || undefined,
		variantId: variant?.id,
		variantTitle: variant?.title || 'Default',
	};

	const updateIcon = () => {
		const isWishlisted = !!$wishlistItems.get()[String(productId)];
		btn.innerHTML = DOMPurify.sanitize(isWishlisted
			? '<svg class="size-5 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"/></svg>'
			: '<svg class="size-5 text-gray-400 hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>'
		, { USE_PROFILES: { svg: true } });
	};

	updateIcon();
	$wishlistItems.subscribe(updateIcon);

	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleWishlist(wishlistItem);
	});

	return btn;
};

const renderProducts = (products: ProductListItem[]) => {
	const grid = document.getElementById('product-grid');
	if (!grid) return;
	grid.innerHTML = '';

	products.forEach((product) => {
		const card = document.createElement('div');
		card.className = 'group relative flex flex-col overflow-hidden rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:shadow-xl hover:scale-[1.01]';

		// Wishlist heart button (top-right, above link overlay)
		const variant = Array.isArray(product.variants) ? product.variants[0] : null;
		const heartBtn = createWishlistHeart(product, variant);
		card.appendChild(heartBtn);

		// 1. Tag / Badge (Top Left)
		const tag = document.createElement('span');
		tag.className = 'mb-2 text-[10px] font-bold uppercase tracking-wider text-[#bf4800]';
		tag.textContent = i18n.new;
		card.appendChild(tag);

		// 2. Title & Desc
		const titleLink = document.createElement('a');
		titleLink.href = `/products/${product.id}`;
		titleLink.className = 'text-xl font-semibold text-[#1d1d1f] hover:underline decoration-1 underline-offset-2';
		titleLink.textContent = String(product.title ?? '');

		const fullLinkOverlay = document.createElement('span');
		fullLinkOverlay.className = 'absolute inset-0';
		titleLink.appendChild(fullLinkOverlay);

		card.appendChild(titleLink);

		// Shipping badge based on stock
		const stock = variant?.stock ?? 0;

		const shippingBadge = document.createElement('span');
		shippingBadge.className = stock > 0
			? 'mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'
			: 'mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800';
		shippingBadge.textContent = stock > 0 ? i18n.domesticShipping : i18n.internationalShipping;
		card.appendChild(shippingBadge);

		// 3. Image Container
		const imgContainer = document.createElement('div');
		imgContainer.className = 'mt-8 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#f5f5f7] flex items-center justify-center';

		if (product.image) {
			const img = document.createElement('img');
			img.src = product.image;
			img.alt = product.title ?? '';
			img.loading = 'lazy';
			img.className = 'w-full h-full object-cover';
			imgContainer.appendChild(img);
		} else {
			const imgPlaceholder = document.createElement('div');
			imgPlaceholder.className = 'w-full h-full flex items-center justify-center';
			imgPlaceholder.setAttribute('aria-hidden', 'true');
			imgPlaceholder.innerHTML = `<svg class="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
			imgContainer.appendChild(imgPlaceholder);
		}

		card.appendChild(imgContainer);

		// 4. Price & Buy (Bottom)
		const footer = document.createElement('div');
		footer.className = 'mt-auto pt-6 flex items-center justify-between';

		const price = variant?.price;

		const priceEl = document.createElement('span');
		priceEl.className = 'text-[15px] text-[#1d1d1f]';
		priceEl.textContent = price ? `${i18n.from} ${price.amount.toLocaleString()} ${price.currency}` : '';

		const buyBtn = document.createElement('span');
		buyBtn.className = 'rounded-full bg-brand px-4 py-1.5 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100';
		buyBtn.textContent = i18n.buy;

		footer.appendChild(priceEl);
		footer.appendChild(buyBtn);
		card.appendChild(footer);

		grid.appendChild(card);
	});
};

const buildPageUrl = (newPage: number): string => {
	const params = new URLSearchParams(window.location.search);
	params.set('page', String(newPage));
	return `?${params.toString()}`;
};

const renderPagination = (meta: PageMeta | null) => {
	const pagination = document.getElementById('pagination');
	const paginationInfo = document.getElementById('pagination-info');
	const prevPage = document.getElementById('prev-page') as HTMLAnchorElement | null;
	const nextPage = document.getElementById('next-page') as HTMLAnchorElement | null;
	const currentPage = document.getElementById('current-page');

	if (!meta || !pagination || !paginationInfo || !prevPage || !nextPage || !currentPage) return;

	const { page, perPage, totalCount, totalPages } = meta;
	const start = (page - 1) * perPage + 1;
	const end = Math.min(page * perPage, totalCount);

	paginationInfo.textContent = i18n.showingCount
		.replace('{start}', String(start))
		.replace('{end}', String(end))
		.replace('{total}', String(totalCount));
	currentPage.textContent = i18n.pageInfo
		.replace('{page}', String(page))
		.replace('{totalPages}', String(totalPages));

	// Show/hide prev/next buttons
	if (page > 1) {
		prevPage.classList.remove('hidden');
		prevPage.href = buildPageUrl(page - 1);
	} else {
		prevPage.classList.add('hidden');
	}

	if (page < totalPages) {
		nextPage.classList.remove('hidden');
		nextPage.href = buildPageUrl(page + 1);
	} else {
		nextPage.classList.add('hidden');
	}

	pagination.classList.remove('hidden');
};

const escapeHtml = (str: string): string => {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
};

const loadProducts = async () => {
	const apiBase = getApiBase();
	setState('loading');

	// Get all filter params from URL
	const urlParams = new URLSearchParams(window.location.search);
	const searchQuery = urlParams.get('q') || '';
	const category = urlParams.get('category') || '';
	const minPrice = urlParams.get('minPrice') || '';
	const maxPrice = urlParams.get('maxPrice') || '';
	const page = urlParams.get('page') || '1';

	// Update UI for search
	const searchInfo = document.getElementById('search-info');
	const searchTerm = document.getElementById('search-term');
	const sectionTitle = document.getElementById('section-title');
	const filterInfo = document.getElementById('filter-info');
	const activeFilters = document.getElementById('active-filters');

	if (searchQuery && searchInfo && searchTerm && sectionTitle) {
		searchTerm.textContent = searchQuery;
		searchInfo.classList.remove('hidden');
		sectionTitle.textContent = i18n.searchResults;
	}

	// Show active filters info
	const hasFilters = category || minPrice || maxPrice;
	if (hasFilters && filterInfo && activeFilters) {
		const badges: string[] = [];
		if (category) badges.push(`<span class="px-2 py-1 text-xs bg-[#0071e3]/10 text-[#0071e3] rounded-full capitalize">${escapeHtml(category)}</span>`);
		if (minPrice || maxPrice) {
			const priceLabel = minPrice && maxPrice
				? `${Number(minPrice).toLocaleString()} - ${Number(maxPrice).toLocaleString()} JPY`
				: minPrice
				? i18n.priceAbove.replace('{min}', Number(minPrice).toLocaleString())
				: i18n.priceUpTo.replace('{max}', Number(maxPrice).toLocaleString());
			badges.push(`<span class="px-2 py-1 text-xs bg-[#0071e3]/10 text-[#0071e3] rounded-full">${priceLabel}</span>`);
		}
		activeFilters.innerHTML = DOMPurify.sanitize(badges.join(''));
		filterInfo.classList.remove('hidden');
		if (sectionTitle && !searchQuery) {
			sectionTitle.textContent = i18n.filteredResults;
		}
	}

	try {
		// Build URL with all params
		const params = new URLSearchParams();
		if (searchQuery) params.set('q', searchQuery);
		if (category) params.set('category', category);
		if (minPrice) params.set('minPrice', minPrice);
		if (maxPrice) params.set('maxPrice', maxPrice);
		params.set('page', page);

		const queryString = params.toString();
		const url = buildStoreUrl(queryString ? `/products?${queryString}` : '/products', apiBase);
		const data = await fetchJson(url) as any;
		const products = Array.isArray(data?.products) ? data.products.filter(isProduct) : [];

		if (!products.length) {
			setState('empty');
			return;
		}

		renderProducts(products);
		renderPagination(data?.meta);
		setState('loaded');
		announceProductCount(products.length);
	} catch (err) {
		const status = (err as { status?: number }).status;
		if (status === 404) {
			showError(i18n.errorNotFound, i18n.errorNotFoundDesc);
		} else if (status && status >= 500) {
			showError(i18n.errorServer, i18n.errorServerDesc);
		} else if (!status) {
			showError(i18n.errorNetwork, i18n.errorNetworkDesc);
		} else {
			showError(i18n.errorGeneric, i18n.errorGenericDesc);
		}
		setState('error');
	}
};

loadProducts();

// Mobile filter bottom sheet
const mobileFilterBtn = document.getElementById('mobile-filter-btn');
const mobileFilterSheet = document.getElementById('mobile-filter-sheet');
const mobileFilterOverlay = document.getElementById('mobile-filter-overlay');
const mobileFilterClose = document.getElementById('mobile-filter-close');

if (mobileFilterBtn && mobileFilterSheet && mobileFilterOverlay) {
	const getFocusableElements = (): HTMLElement[] => {
		const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		return Array.from(mobileFilterSheet.querySelectorAll<HTMLElement>(selector));
	};

	const handleTrapKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			closeFilters();
			return;
		}
		if (e.key !== 'Tab') return;
		const focusable = getFocusableElements();
		if (focusable.length === 0) return;
		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!
		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	};

	const openFilters = () => {
		mobileFilterSheet.classList.remove('translate-y-full');
		mobileFilterOverlay.classList.remove('hidden');
		document.body.style.overflow = 'hidden';
		document.addEventListener('keydown', handleTrapKeydown);
		mobileFilterClose?.focus();
	};

	const closeFilters = () => {
		mobileFilterSheet.classList.add('translate-y-full');
		mobileFilterOverlay.classList.add('hidden');
		document.body.style.overflow = '';
		document.removeEventListener('keydown', handleTrapKeydown);
		mobileFilterBtn.focus();
	};

	mobileFilterBtn.addEventListener('click', openFilters);
	mobileFilterClose?.addEventListener('click', closeFilters);
	mobileFilterOverlay.addEventListener('click', closeFilters);
}
