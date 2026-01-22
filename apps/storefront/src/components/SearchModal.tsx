import { useState, useEffect, useRef } from 'react';
import { getApiBase } from '../lib/api';
import { useTranslation } from '../i18n';

type SearchResult = {
	id: number;
	title: string;
	description: string | null;
	variants: Array<{
		id: number;
		title: string;
		price: {
			amount: number;
			currency: string;
		};
	}>;
};

const formatPrice = (amount: number, currency: string) => {
	return new Intl.NumberFormat('ja-JP', {
		style: 'currency',
		currency: currency || 'JPY'
	}).format(amount);
};

export default function SearchModal() {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);

	// Listen for open-search event
	useEffect(() => {
		const handleOpen = () => {
			setIsOpen(true);
			setQuery('');
			setResults([]);
			setSelectedIndex(0);
		};

		window.addEventListener('open-search', handleOpen);
		return () => window.removeEventListener('open-search', handleOpen);
	}, []);

	// Focus input when modal opens
	useEffect(() => {
		if (isOpen) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// Debounced search
	useEffect(() => {
		if (!query || query.length < 2) {
			setResults([]);
			return;
		}

		setLoading(true);
		const timer = setTimeout(async () => {
			try {
				const apiBase = getApiBase();
				const res = await fetch(`${apiBase}/store/products?q=${encodeURIComponent(query)}`);
				const data = await res.json();
				setResults(data.products || []);
				setSelectedIndex(0);
			} catch (err) {
				console.error('Search error:', err);
				setResults([]);
			} finally {
				setLoading(false);
			}
		}, 300);

		return () => clearTimeout(timer);
	}, [query]);

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setIsOpen(false);
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				setSelectedIndex(prev => Math.max(prev - 1, 0));
			} else if (e.key === 'Enter' && results[selectedIndex]) {
				e.preventDefault();
				window.location.href = `/products/${results[selectedIndex].id}`;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, results, selectedIndex]);

	// Scroll selected item into view
	useEffect(() => {
		if (resultsRef.current && results.length > 0) {
			const selectedEl = resultsRef.current.children[selectedIndex] as HTMLElement;
			selectedEl?.scrollIntoView({ block: 'nearest' });
		}
	}, [selectedIndex, results]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 overflow-y-auto"
			role="dialog"
			aria-modal="true"
		>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm"
				onClick={() => setIsOpen(false)}
			/>

			{/* Modal */}
			<div className="fixed inset-x-0 top-0 p-4 sm:p-6 md:p-20">
				<div className="mx-auto max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl">
					{/* Search input */}
					<div className="relative">
						<svg
							className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fillRule="evenodd"
								d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
								clipRule="evenodd"
							/>
						</svg>
						<input
							ref={inputRef}
							type="text"
							className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
							placeholder={t('common.searchProducts')}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{loading && (
							<div className="absolute right-4 top-3.5">
								<svg className="h-5 w-5 animate-spin text-gray-400" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
								</svg>
							</div>
						)}
					</div>

					{/* Results */}
					{query.length >= 2 && (
						<div className="border-t border-gray-100">
							{results.length > 0 ? (
								<div ref={resultsRef} className="max-h-80 overflow-y-auto py-2">
									{results.map((product, index) => {
										const price = product.variants[0]?.price;
										return (
											<a
												key={product.id}
												href={`/products/${product.id}`}
												className={`flex items-center gap-4 px-4 py-3 ${
													index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
												}`}
											>
												<div className="h-12 w-12 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center">
													<span className="text-xs font-medium text-gray-400">IMG</span>
												</div>
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium text-gray-900 truncate">
														{product.title}
													</p>
													{product.description && (
														<p className="text-sm text-gray-500 truncate">
															{product.description}
														</p>
													)}
												</div>
												{price && (
													<div className="text-sm font-medium text-gray-900">
														{formatPrice(price.amount, price.currency)}
													</div>
												)}
											</a>
										);
									})}
								</div>
							) : !loading ? (
								<div className="px-4 py-8 text-center">
									<svg
										className="mx-auto h-12 w-12 text-gray-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<p className="mt-2 text-sm text-gray-500">
										{t('common.noResults')}
									</p>
									<p className="mt-1 text-xs text-gray-400">
										Try a different search term
									</p>
								</div>
							) : null}
						</div>
					)}

					{/* Footer hint */}
					<div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
						<div className="flex items-center gap-2">
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">↑</kbd>
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">↓</kbd>
							<span>to navigate</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
							<span>to select</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
							<span>to close</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
