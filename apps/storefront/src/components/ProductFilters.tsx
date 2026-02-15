import { useState, useEffect } from 'react';
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

export default function ProductFilters() {
	const { t } = useTranslation();
	const [options, setOptions] = useState<FilterOptions | null>(null);
	const [loading, setLoading] = useState(true);
	const [filters, setFilters] = useState<CurrentFilters>({
		category: null,
		minPrice: null,
		maxPrice: null
	});
	const [minPriceInput, setMinPriceInput] = useState('');
	const [maxPriceInput, setMaxPriceInput] = useState('');

	// Load filter options and current filters from URL
	useEffect(() => {
		const loadFilters = async () => {
			try {
				const apiBase = getApiBase();
				const res = await fetch(`${apiBase}/store/products/filters`);
				const data = await res.json();
				setOptions(data);
			} catch (err) {
				console.error('Failed to load filter options:', err);
			} finally {
				setLoading(false);
			}
		};

		// Parse current URL params
		const params = new URLSearchParams(window.location.search);
		const category = params.get('category');
		const minPrice = params.get('minPrice');
		const maxPrice = params.get('maxPrice');

		setFilters({
			category,
			minPrice: minPrice ? Number(minPrice) : null,
			maxPrice: maxPrice ? Number(maxPrice) : null
		});
		setMinPriceInput(minPrice || '');
		setMaxPriceInput(maxPrice || '');

		loadFilters();
	}, []);

	const applyFilters = () => {
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
				<div className="h-4 w-24 bg-gray-200 rounded"></div>
				<div className="space-y-2">
					<div className="h-4 w-32 bg-gray-100 rounded"></div>
					<div className="h-4 w-28 bg-gray-100 rounded"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Category Filter */}
			{options && options.categories.length > 0 && (
				<div>
					<h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">{t('filters.category')}</h3>
					<div className="space-y-2">
						{options.categories.map((cat) => (
							<div key={cat} className="flex items-center justify-between group">
								<label className="flex items-center gap-2 cursor-pointer flex-1">
									<input
										type="radio"
										name="category"
										checked={filters.category === cat}
										onChange={() => setFilters((prev) => ({ ...prev, category: cat }))}
										className="h-4 w-4 text-[#0071e3] border-gray-300 focus:ring-[#0071e3]"
									/>
									<span className="text-sm text-[#1d1d1f]/80 group-hover:text-[#1d1d1f] capitalize">
										{cat}
									</span>
								</label>
								<a
									href={`/categories/${encodeURIComponent(cat)}`}
									className="text-[10px] text-[#86868b] opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#0071e3]"
								>
									&#8594;
								</a>
							</div>
						))}
						{filters.category && (
							<button
								type="button"
								onClick={() => setFilters((prev) => ({ ...prev, category: null }))}
								className="text-xs text-[#0071e3] hover:underline mt-1"
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
					<h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">{t('filters.priceRange')}</h3>
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<input
								type="number"
								placeholder={String(options.priceRange.min)}
								value={minPriceInput}
								onChange={(e) => setMinPriceInput(e.target.value)}
								className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0071e3] focus:border-[#0071e3]"
							/>
							<span className="text-gray-400">-</span>
							<input
								type="number"
								placeholder={String(options.priceRange.max)}
								value={maxPriceInput}
								onChange={(e) => setMaxPriceInput(e.target.value)}
								className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0071e3] focus:border-[#0071e3]"
							/>
						</div>
						<p className="text-xs text-gray-500">
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
					className="w-full px-4 py-2 text-sm font-medium text-white bg-[#0071e3] rounded-lg hover:bg-[#0077ed] transition-colors"
				>
					{t('filters.applyFilters')}
				</button>
				{hasActiveFilters && (
					<button
						type="button"
						onClick={clearFilters}
						className="w-full px-4 py-2 text-sm font-medium text-[#0071e3] bg-white border border-[#0071e3] rounded-lg hover:bg-[#f5f5f7] transition-colors"
					>
						{t('filters.clearAll')}
					</button>
				)}
			</div>
		</div>
	);
}
