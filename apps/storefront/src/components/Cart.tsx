import { useStore } from '@nanostores/react';
import {
	$cartArray,
	$cartTotal,
	$cartSubtotal,
	$cartTaxAmount,
	$cartCurrency,
	$cartDiscount,
	$shippingFee,
	$cartGrandTotal,
	removeFromCart,
	updateQuantity,
	setShippingConfig,
	type CartItem,
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n';
import { ErrorBoundary } from './ErrorBoundary';
import { CartOrderSummary } from './CartOrderSummary';
import { EmptyStateReact } from './EmptyStateReact';
import { formatPrice } from '../lib/format';

function EmptyCart() {
	const { t } = useTranslation();
	return (
		<EmptyStateReact
			icon="cart"
			title={t('cart.empty')}
			description={t('cart.emptyDescription')}
			ctaLabel={t('cart.browseProducts')}
			ctaHref="/products"
		/>
	);
}

const MAX_QUANTITY = 99;

function buildQuantityOptions(currentQuantity: number, stock?: number): number[] {
	const max = stock !== undefined ? Math.min(stock, MAX_QUANTITY) : MAX_QUANTITY;
	const safeMax = Math.max(max, currentQuantity);
	const count = Math.min(safeMax, MAX_QUANTITY);
	return Array.from({ length: count }, (_, i) => i + 1);
}

function CartItemRow({ item, itemRef }: { item: CartItem; itemRef?: React.Ref<HTMLLIElement> }) {
	const { t } = useTranslation();
	const [stockError, setStockError] = useState<string | null>(null);
	const quantityOptions = buildQuantityOptions(item.quantity, item.stock);
	const isAtStockLimit = item.stock !== undefined && item.quantity >= item.stock;

	return (
		<li ref={itemRef} className="flex py-6 sm:py-10">
			<div className="shrink-0">
				{item.imageUrl ? (
					<img
						src={item.imageUrl}
						alt={item.title}
						width={192}
						height={192}
						loading="lazy"
						className="size-24 rounded-xl object-cover sm:size-48"
					/>
				) : (
					<div className="size-24 rounded-xl bg-neutral-100 flex items-center justify-center sm:size-48" aria-hidden="true">
						<svg className="size-8 text-neutral-300 sm:size-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
						</svg>
					</div>
				)}
			</div>

			<div className="ml-4 flex flex-1 flex-col justify-between sm:ml-6">
				<div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
					<div>
						<div className="flex justify-between">
							<h3 className="text-sm">
								<a href={`/products/${item.productId}`} className="font-medium text-neutral-700 hover:text-neutral-800">
									{item.title}
								</a>
							</h3>
						</div>
						{item.variantTitle && item.variantTitle !== 'Default' && (
							<div className="mt-1 flex text-sm">
								<p className="text-neutral-500">{item.variantTitle}</p>
							</div>
						)}
						<p className="mt-1 text-sm font-medium text-neutral-900">{formatPrice(item.price, item.currency)}</p>
					</div>

					<div className="mt-4 sm:mt-0 sm:pr-9">
						<div className="grid w-full max-w-16 grid-cols-1">
							<select
								value={item.quantity}
								onChange={(e) => {
									const val = Number(e.target.value);
									if (val > 0 && (item.stock === undefined || val <= item.stock)) {
										updateQuantity(item.variantId, val);
										setStockError(null);
									} else if (item.stock !== undefined && val > item.stock) {
										setStockError(
											t('cart.stockInsufficient', { stock: String(item.stock) })
										);
									}
								}}
								disabled={isAtStockLimit && quantityOptions.length <= 1}
								aria-label={t('cart.quantityLabel', { title: item.title })}
								className="col-start-1 row-start-1 appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-neutral-900 outline outline-1 -outline-offset-1 outline-neutral-300 focus:outline-2 focus:-outline-offset-2 focus:outline-brand disabled:bg-neutral-100 disabled:cursor-not-allowed sm:text-sm min-h-[44px]"
							>
								{quantityOptions.map((n) => (
									<option key={n} value={n} disabled={item.stock !== undefined && n > item.stock}>
										{n}
									</option>
								))}
							</select>
							<svg className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-neutral-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
								<path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
							</svg>
						</div>

						{isAtStockLimit && (
							<p className="mt-1 text-xs text-warning" role="alert">
								{t('cart.stockInsufficient', { stock: String(item.stock) })}
							</p>
						)}
						{stockError && !isAtStockLimit && (
							<p className="mt-1 text-xs text-danger" role="alert">
								{stockError}
							</p>
						)}

						<div className="absolute top-0 right-0">
							<button
								type="button"
								onClick={() => removeFromCart(item.variantId)}
								className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2 p-2 text-sm font-medium text-brand hover:text-brand-active transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
							>
								{t('common.remove')}
							</button>
						</div>
					</div>
				</div>
			</div>
		</li>
	);
}

type ShippingFetchState = 'idle' | 'loading' | 'success' | 'error';

function useShippingConfig() {
	const [state, setState] = useState<ShippingFetchState>('idle');
	const fetchingRef = useRef(false);

	const fetchConfig = useCallback(async () => {
		if (fetchingRef.current) return;
		fetchingRef.current = true;
		setState('loading');
		try {
			const data = await fetchJson<{
				shippingFee: number;
				freeShippingThreshold: number;
			}>(`${getApiBase()}/checkout/config`);

			if (data.shippingFee !== undefined && data.freeShippingThreshold !== undefined) {
				setShippingConfig(data);
			}
			setState('success');
		} catch {
			setState('error');
		} finally {
			fetchingRef.current = false;
		}
	}, []);

	useEffect(() => {
		fetchConfig();
	}, [fetchConfig]);

	return { state, retry: fetchConfig };
}

function CartContent() {
	const { t } = useTranslation();
	const items = useStore($cartArray);
	const cartTotal = useStore($cartTotal);
	const subtotal = useStore($cartSubtotal);
	const taxAmount = useStore($cartTaxAmount);
	const discount = useStore($cartDiscount);
	const shipping = useStore($shippingFee);
	const grandTotal = useStore($cartGrandTotal);
	const currency = useStore($cartCurrency);
	const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map());
	const prevItemsRef = useRef<CartItem[]>([]);
	const [announcement, setAnnouncement] = useState('');
	const announcementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { state: shippingState, retry: retryShipping } = useShippingConfig();

	// Track item deletions / quantity changes: move focus + announce
	useEffect(() => {
		const prevItems = prevItemsRef.current;
		let newAnnouncement = '';

		if (prevItems.length > items.length) {
			// Item removed
			const removed = prevItems.find(
				(prev) => !items.some((curr) => curr.variantId === prev.variantId)
			);
			if (removed) {
				newAnnouncement = t('cart.itemRemoved', { title: removed.title });
			}
			// Focus management
			if (items.length > 0) {
				const removedIndex = prevItems.findIndex(
					(prev) => !items.some((curr) => curr.variantId === prev.variantId)
				);
				if (removedIndex >= 0) {
					const focusIndex = Math.min(removedIndex, items.length - 1);
					const targetItem = items[focusIndex];
					if (targetItem) {
						const el = itemRefs.current.get(targetItem.variantId);
						const focusable = el?.querySelector<HTMLElement>('a, button, select, input');
						if (focusable) {
							focusable.focus();
						} else if (el) {
							el.tabIndex = -1;
							el.focus();
						}
					}
				}
			}
		} else if (prevItems.length === items.length && prevItems.length > 0) {
			// Quantity change
			const changed = items.find((curr) => {
				const prev = prevItems.find((p) => p.variantId === curr.variantId);
				return prev && prev.quantity !== curr.quantity;
			});
			if (changed) {
				newAnnouncement = t('cart.quantityChanged', { title: changed.title, quantity: String(changed.quantity) });
			}
		}

		if (newAnnouncement) {
			// Debounce: clear any pending timeout before setting new announcement
			if (announcementTimeoutRef.current) {
				clearTimeout(announcementTimeoutRef.current);
			}
			setAnnouncement(newAnnouncement);
			// Auto-clear announcement after 3 seconds to prevent stale screen reader content
			announcementTimeoutRef.current = setTimeout(() => {
				setAnnouncement('');
			}, 3000);
		}

		prevItemsRef.current = items;

		return () => {
			if (announcementTimeoutRef.current) {
				clearTimeout(announcementTimeoutRef.current);
			}
		};
	}, [items, t]);

	const handleCheckout = () => {
		if (items.length === 0) return;
		window.location.href = '/checkout';
	};

	if (items.length === 0) {
		return <EmptyCart />;
	}

	return (
		<>
			<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16 pb-24 lg:pb-0">
				<div aria-live="polite" className="sr-only">
					{t('cart.itemCount', { count: items.length })}
					{' '}
					{t('cart.orderTotal')}: {formatPrice(grandTotal, currency)}
				</div>
				<div aria-live="assertive" role="status" className="sr-only">
					{announcement}
				</div>
				<section aria-labelledby="cart-heading" className="lg:col-span-7">
					<h2 id="cart-heading" className="sr-only">{t('cart.itemsInCart')}</h2>
					<ul role="list" className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
						{items.map((item) => (
							<CartItemRow
								key={item.variantId}
								item={item}
								itemRef={(el: HTMLLIElement | null) => {
									if (el) {
										itemRefs.current.set(item.variantId, el);
									} else {
										itemRefs.current.delete(item.variantId);
									}
								}}
							/>
						))}
					</ul>
				</section>

				<div className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
					{shippingState === 'error' && (
						<div className="mb-4 rounded-md bg-danger-light border border-danger/20 p-4 text-center">
							<p className="text-sm text-danger">{t('cart.shippingConfigError')}</p>
							<p className="mt-1 text-xs text-danger">{t('cart.checkoutBlockedByShipping')}</p>
							<button
								type="button"
								onClick={retryShipping}
								className="mt-2 text-sm font-medium text-danger underline hover:opacity-80 min-h-[44px] inline-flex items-center"
							>
								{t('cart.retry')}
							</button>
						</div>
					)}
					<CartOrderSummary
						subtotal={subtotal}
						taxAmount={taxAmount}
						cartTotal={cartTotal}
						discount={discount}
						shipping={shipping}
						grandTotal={grandTotal}
						currency={currency}
						onCheckout={handleCheckout}
						checkoutDisabled={shippingState === 'error'}
					/>
				</div>
			</div>

			{/* Mobile sticky bottom bar - visible below lg breakpoint */}
			<div className="fixed bottom-0 inset-x-0 z-40 border-t border-neutral-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] lg:hidden">
				<div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-xs text-neutral-500">{t('cart.orderTotal')}</p>
						<p className="text-lg font-bold text-neutral-900">{formatPrice(grandTotal, currency)}</p>
					</div>
					<button
						type="button"
						onClick={handleCheckout}
						disabled={shippingState === 'error'}
						className="shrink-0 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-active active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
					>
						{t('cart.checkout')}
					</button>
				</div>
			</div>
		</>
	);
}

export default function Cart() {
	return (
		<ErrorBoundary>
			<CartContent />
		</ErrorBoundary>
	);
}
