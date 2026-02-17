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
import { formatPrice } from '../lib/format';

function EmptyCart() {
	const { t } = useTranslation();
	return (
		<div className="text-center py-24 px-4">
			<svg className="mx-auto h-20 w-20 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
			</svg>
			<h2 className="mt-6 text-xl font-semibold text-neutral-900">{t('cart.empty')}</h2>
			<p className="mt-2 text-base text-neutral-500 max-w-sm mx-auto">{t('cart.emptyDescription')}</p>
			<div className="mt-8">
				<a href="/products" className="inline-flex items-center rounded-full bg-brand px-6 py-3 text-base font-medium text-white hover:bg-brand-active transition-colors">
					{t('cart.browseProducts')}
				</a>
			</div>
		</div>
	);
}

const MAX_QUANTITY = 99;

function getMaxQuantity(stock?: number): number {
	return stock !== undefined ? Math.min(stock, MAX_QUANTITY) : MAX_QUANTITY;
}

function CartItemRow({ item, itemRef }: { item: CartItem; itemRef?: React.Ref<HTMLLIElement> }) {
	const { t } = useTranslation();
	const maxQty = getMaxQuantity(item.stock);

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
						<div className="flex items-center gap-2" role="group" aria-label={t('cart.quantityLabel', { title: item.title })}>
							<button
								type="button"
								onClick={() => {
									if (item.quantity > 1) {
										updateQuantity(item.variantId, item.quantity - 1);
									}
								}}
								disabled={item.quantity <= 1}
								aria-label={t('cart.decreaseQuantity')}
								className="min-h-[44px] min-w-[44px] rounded-full ring-1 ring-neutral-300 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
							>
								<svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
								</svg>
							</button>
							<span className="min-w-[2rem] text-center text-sm font-medium text-neutral-900" aria-live="polite">
								{item.quantity}
							</span>
							<button
								type="button"
								onClick={() => {
									if (item.quantity < maxQty) {
										updateQuantity(item.variantId, item.quantity + 1);
									}
								}}
								disabled={item.quantity >= maxQty}
								aria-label={t('cart.increaseQuantity')}
								className="min-h-[44px] min-w-[44px] rounded-full ring-1 ring-neutral-300 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
							>
								<svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
								</svg>
							</button>
						</div>

						<div className="mt-2 sm:absolute sm:top-0 sm:right-0 sm:mt-0">
							<button
								type="button"
								onClick={() => removeFromCart(item.variantId)}
								className="text-sm font-medium text-brand hover:text-brand-active transition-colors"
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
	const { state: shippingState, retry: retryShipping } = useShippingConfig();

	// Track item deletions and move focus to next item
	useEffect(() => {
		const prevItems = prevItemsRef.current;
		if (prevItems.length > items.length && items.length > 0) {
			const removedIndex = prevItems.findIndex(
				(prev) => !items.some((curr) => curr.variantId === prev.variantId)
			);
			if (removedIndex >= 0) {
				const focusIndex = Math.min(removedIndex, items.length - 1);
				const targetItem = items[focusIndex];
				if (targetItem) {
					const el = itemRefs.current.get(targetItem.variantId);
					const focusable = el?.querySelector<HTMLElement>('a, button, select, input');
					focusable?.focus();
				}
			}
		}
		prevItemsRef.current = items;
	}, [items]);

	const handleCheckout = () => {
		if (items.length === 0) return;
		window.location.href = '/checkout';
	};

	if (items.length === 0) {
		return <EmptyCart />;
	}

	return (
		<div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-12 xl:gap-x-16">
			<div aria-live="polite" className="sr-only">
				{t('cart.itemCount', { count: items.length })}
				{' '}
				{t('cart.orderTotal')}: {formatPrice(grandTotal, currency)}
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
					<div className="mb-4 rounded-md bg-red-50 border border-red-200 p-4 text-center">
						<p className="text-sm text-red-800">{t('cart.shippingConfigError')}</p>
						<p className="mt-1 text-xs text-red-600">{t('cart.checkoutBlockedByShipping')}</p>
						<button
							type="button"
							onClick={retryShipping}
							className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900"
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
	);
}

export default function Cart() {
	return (
		<ErrorBoundary>
			<CartContent />
		</ErrorBoundary>
	);
}
