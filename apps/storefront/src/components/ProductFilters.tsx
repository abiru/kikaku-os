import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../lib/api';
import { useTranslation } from '../i18n';

type FilterOptions = {
	categories: string[];
	priceRange: {
		min: number;
		max: number;
	};
};

type CurrentFilters = {
	category: string | null;
	minPrice: number | null;
	maxPrice: number | null;
};

function parseFiltersFromUrl(): { filters: CurrentFilters; minPriceInput: string; maxPriceInput: string } {
	const params = new URLSearchParams(window.location.search);
	const category = params.get('category');
	const minPrice = params.get('minPrice');
	const maxPrice = params.get('maxPrice');

	return {
		filters: {
			category,
			minPrice: minPrice ? Number(minPrice) : null,
			maxPrice: maxPrice ? Number(maxPrice) : null
		},
		minPriceInput: minPrice || '',
		maxPriceInput: maxPrice || ''
	};
}

function countActiveFilters(filters: CurrentFilters): number {
	let count = 0;
	if (filters.category) count++;
	if (filters.minPrice) count++;
	if (filters.maxPrice) count++;
	return count;
}

export default function ProductFilters() {
	const { t } = useTranslation();
	const [options, setOptions] = useState<FilterOptions | null>(null);
	const [loading, setLoading] = useState(true);
	const [applying, setApplying] = useState(false);
	const [filters, setFilters] = useState<CurrentFilters>({
		category: null,
		minPrice: null,
		maxPrice: null
	});
	const [minPriceInput, setMinPriceInput] = useState('');
	const [maxPriceInput, setMaxPriceInput] = useState('');

	const syncStateFromUrl = useCallback(() => {
		const parsed = parseFiltersFromUrl();
		setFilters(parsed.filters);
		setMinPriceInput(parsed.minPriceInput);
		setMaxPriceInput(parsed.maxPriceInput);
	}, []);

	// Load filter options and sync state from URL
	useEffect(() => {
		const loadFilters = async () => {
			try {
				const apiBase = getApiBase();
				const res = await fetch(`${apiBase}/store/products/filters`);
				const data = await res.json();
				setOptions(data);
			} catch {
				// Filter options unavailable; continue with defaults
			} finally {
				setLoading(false);
			}
		};

		syncStateFromUrl();
		loadFilters();
	}, [syncStateFromUrl]);

	// Sync filter state on browser back/forward
	useEffect(() => {
		const handlePopstate = () => {
			syncStateFromUrl();
			setApplying(false);
		};

		window.addEventListener('popstate', handlePopstate);
		return () => window.removeEventListener('popstate', handlePopstate);
	}, [syncStateFromUrl]);

	// Expose active filter count for mobile badge
	useEffect(() => {
		const count = countActiveFilters(filters);
		const badge = document.getElementById('mobile-filter-count');
		if (badge) {
			badge.textContent = count > 0 ? String(count) : '';
			badge.classList.toggle('hidden', count === 0);
		}
	}, [filters]);

	const applyFilters = () => {
		setApplying(true);

		const params = new URLSearchParams(window.location.search);

		// Preserve search query if exists
		const q = params.get('q');
		params.delete('q');
		params.delete('category');
		params.delete('minPrice');
		params.delete('maxPrice');

		if (q) params.set('q', q);
		if (filters.category) params.set('category', filters.category);
		if (minPriceInput) params.set('minPrice', minPriceInput);
		if (maxPriceInput) params.set('maxPrice', maxPriceInput);

		const newUrl = params.toString()
			? `${window.location.pathname}?${params.toString()}`
			: window.location.pathname;

		window.location.href = newUrl;
	};

	const clearFilters = () => {
		setApplying(true);

		const params = new URLSearchParams(window.location.search);
		const q = params.get('q');

		const newUrl = q
			? `${window.location.pathname}?q=${encodeURIComponent(q)}`
			: window.location.pathname;

		window.location.href = newUrl;
	};

	const hasActiveFilters = filters.category || filters.minPrice || filters.maxPrice;

	if (loading) {
		return (
			<div className="animate-pulse space-y-4">
				<div className="h-4 w-24 bg-neutral-200 rounded"></div>
				<div className="space-y-2">
					<div className="h-4 w-32 bg-neutral-100 rounded"></div>
					<div className="h-4 w-28 bg-neutral-100 rounded"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div aria-live="polite" className="sr-only">
				{hasActiveFilters && t('filters.activeFilters')}
			</div>
			{/* Category Filter */}
			{options && options.categories.length > 0 && (
				<div>
					<h3 className="text-sm font-semibold text-primary mb-3">{t('filters.category')}</h3>
					<div className="space-y-2">
						{options.categories.map((cat) => (
							<div key={cat} className="group">
								<label className="flex items-center gap-3 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-subtle transition-colors">
									<span className="relative flex items-center justify-center h-5 w-5">
										<input
											type="radio"
											name="category"
											checked={filters.category === cat}
											onChange={() => setFilters((prev) => ({ ...prev, category: cat }))}
											className="sr-only peer"
											disabled={applying}
										/>
										<span className="h-5 w-5 rounded-full ring-1 ring-neutral-300 peer-checked:ring-2 peer-checked:ring-brand peer-checked:bg-brand transition-all" />
										<svg className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
											<path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6l2.5 2.5 4.5-4.5" />
										</svg>
									</span>
									<span className="flex-1 text-sm text-primary/80 group-hover:text-primary capitalize">
										{cat}
									</span>
									<a
										href={`/categories/${encodeURIComponent(cat)}`}
										className="text-[10px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity hover:text-brand"
										onClick={(e) => e.stopPropagation()}
									>
										&#8594;
									</a>
								</label>
							</div>
						))}
						{filters.category && (
							<button
								type="button"
								onClick={() => setFilters((prev) => ({ ...prev, category: null }))}
								className="text-xs text-brand hover:underline mt-1"
								disabled={applying}
							>
								{t('filters.clearCategory')}
							</button>
						)}
					</div>
				</div>
			)}

			{/* Price Range Filter */}
			{options && (
				<div>
					<h3 className="text-sm font-semibold text-primary mb-3">{t('filters.priceRange')}</h3>
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<div className="w-full">
								<label htmlFor="filter-min-price" className="sr-only">{t('filters.minPrice')}</label>
								<input
									id="filter-min-price"
									type="number"
									placeholder={String(options.priceRange.min)}
									value={minPriceInput}
									onChange={(e) => setMinPriceInput(e.target.value)}
									className="w-full px-3 py-2 text-sm rounded-lg ring-1 ring-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand transition-shadow"
									disabled={applying}
								/>
							</div>
							<span className="text-neutral-500" aria-hidden="true">-</span>
							<div className="w-full">
								<label htmlFor="filter-max-price" className="sr-only">{t('filters.maxPrice')}</label>
								<input
									id="filter-max-price"
									type="number"
									placeholder={String(options.priceRange.max)}
									value={maxPriceInput}
									onChange={(e) => setMaxPriceInput(e.target.value)}
									className="w-full px-3 py-2 text-sm rounded-lg ring-1 ring-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand transition-shadow"
									disabled={applying}
								/>
							</div>
						</div>
						<p className="text-xs text-neutral-500">
							{t('filters.range', {
								min: options.priceRange.min.toLocaleString(),
								max: options.priceRange.max.toLocaleString()
							})}
						</p>
					</div>
				</div>
			)}

			{/* Action Buttons */}
			<div className="flex flex-col gap-2 pt-2">
				<button
					type="button"
					onClick={applyFilters}
					disabled={applying}
					className="w-full px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-60"
				>
					{applying ? (
						<span className="inline-flex items-center gap-2">
							<svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
							{t('filters.applying')}
						</span>
					) : (
						t('filters.applyFilters')
					)}
				</button>
				{hasActiveFilters && (
					<button
						type="button"
						onClick={clearFilters}
						disabled={applying}
						className="w-full px-4 py-2 text-sm font-medium text-brand bg-white border border-brand rounded-lg hover:bg-subtle transition-colors disabled:opacity-60"
					>
						{t('filters.clearAll')}
					</button>
				)}
			</div>
		</div>
	);
}
