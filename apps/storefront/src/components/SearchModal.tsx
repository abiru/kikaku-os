import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBase } from '../lib/api';
import { useTranslation } from '../i18n';
import { formatPrice } from '../lib/format';

type SearchResult = {
	id: number;
	title: string;
	description: string | null;
	image: string | null;
	variants: Array<{
		id: number;
		title: string;
		price: {
			amount: number;
			currency: string;
		};
	}>;
};

export default function SearchModal() {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const modalRef = useRef<HTMLDivElement>(null);

	// Listen for open-search event
	useEffect(() => {
		const handleOpen = () => {
			setIsOpen(true);
			setQuery('');
			setResults([]);
			setError(null);
			setSelectedIndex(0);
		};

		window.addEventListener('open-search', handleOpen);
		return () => window.removeEventListener('open-search', handleOpen);
	}, []);

	// Focus input when modal opens
	useEffect(() => {
		if (isOpen) {
			const timer = setTimeout(() => inputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	// Debounced search with AbortController
	useEffect(() => {
		if (!query || query.length < 2) {
			setResults([]);
			setError(null);
			return;
		}

		const abortController = new AbortController();
		setLoading(true);

		const timer = setTimeout(async () => {
			try {
				const apiBase = getApiBase();
				const res = await fetch(
					`${apiBase}/store/products?q=${encodeURIComponent(query)}`,
					{ signal: abortController.signal }
				);
				const data = await res.json();
				setResults(data.products || []);
				setError(null);
				setSelectedIndex(0);
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') {
					return;
				}
				setResults([]);
				setError(t('errors.networkError'));
			} finally {
				if (!abortController.signal.aborted) {
					setLoading(false);
				}
			}
		}, 300);

		return () => {
			clearTimeout(timer);
			abortController.abort();
		};
	}, [query, t]);

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

	// Focus trap: Tab key loops within modal
	const handleFocusTrap = useCallback((e: KeyboardEvent) => {
		if (e.key !== 'Tab' || !modalRef.current) return;

		const focusable = modalRef.current.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;

		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;

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
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		document.addEventListener('keydown', handleFocusTrap);
		return () => document.removeEventListener('keydown', handleFocusTrap);
	}, [isOpen, handleFocusTrap]);

	if (!isOpen) return null;

	return (
		<div
			ref={modalRef}
			className="fixed inset-0 z-50 overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label={t('common.searchProducts')}
		>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm"
				data-testid="search-backdrop"
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
					<div aria-live="polite" className="sr-only">
						{query.length >= 2 && !loading && (
							results.length > 0
								? t('search.resultCount', { count: results.length })
								: error
									? error
									: t('common.noResults')
						)}
					</div>
					{query.length >= 2 && (
						<div className="border-t border-gray-100" data-testid="search-results">
							{error && !loading ? (
								<div className="px-4 py-8 text-center">
									<svg
										className="mx-auto h-12 w-12 text-red-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
										/>
									</svg>
									<p className="mt-2 text-sm text-red-600">
										{error}
									</p>
									<p className="mt-1 text-xs text-gray-500">
										{t('errors.networkErrorDescription')}
									</p>
									<button
										type="button"
										className="mt-3 inline-flex items-center rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
										onClick={() => {
											setError(null);
											setQuery(prev => prev + ' ');
											setTimeout(() => setQuery(prev => prev.trimEnd()), 0);
										}}
									>
										{t('errors.retry')}
									</button>
								</div>
							) : results.length > 0 ? (
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
												<div className="h-12 w-12 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
													{product.image ? (
														<img
															src={product.image}
															alt={product.title}
															width={64}
															height={64}
															className="h-full w-full object-cover"
														/>
													) : (
														<svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
														</svg>
													)}
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
								<div className="px-4 py-8 text-center" data-testid="search-empty-state">
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
									<p className="mt-1 text-xs text-gray-500">
										{t('search.tryDifferent')}
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
							<span>{t('search.toNavigate')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
							<span>{t('search.toSelect')}</span>
						</div>
						<div className="flex items-center gap-2">
							<kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
							<span>{t('search.toClose')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
