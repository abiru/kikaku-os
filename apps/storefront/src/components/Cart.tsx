import { useStore } from '@nanostores/react';
import {
	$cartArray,
	$cartTotal,
	$cartSubtotal,
	$cartTaxAmount,
	$cartCurrency,
	$cartDiscount,
	$shippingFee,
	$shippingConfig,
	$cartGrandTotal,
	$appliedCoupon,
	removeFromCart,
	updateQuantity,
	applyCoupon,
	removeCoupon,
	setShippingConfig,
	type CartItem,
	type AppliedCoupon
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';
import { ErrorBoundary } from './ErrorBoundary';
import { formatPrice } from '../lib/format';

function EmptyCart() {
	const { t } = useTranslation();
	return (
		<div className="text-center py-16">
			<svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
			</svg>
			<h2 className="mt-4 text-lg font-medium text-gray-900">{t('cart.empty')}</h2>
			<p className="mt-2 text-sm text-gray-500">{t('cart.emptyDescription')}</p>
			<div className="mt-6">
				<a href="/products" className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-active">
					{t('cart.browseProducts')}
				</a>
			</div>
		</div>
	);
}

function CartItemRow({ item, itemRef }: { item: CartItem; itemRef?: React.Ref<HTMLLIElement> }) {
	const { t } = useTranslation();
	return (
		<li ref={itemRef} className="flex py-6 sm:py-10">
			<div className="shrink-0">
				{item.imageUrl ? (
					<img
						src={item.imageUrl}
						alt={item.title}
						loading="lazy"
						className="size-24 rounded-md object-cover sm:size-48"
					/>
				) : (
					<div className="size-24 rounded-md bg-gray-100 flex items-center justify-center sm:size-48" aria-hidden="true">
						<svg className="size-8 text-gray-300 sm:size-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
								<a href={`/products/${item.productId}`} className="font-medium text-gray-700 hover:text-gray-800">
									{item.title}
								</a>
							</h3>
						</div>
						{item.variantTitle && item.variantTitle !== 'Default' && (
							<div className="mt-1 flex text-sm">
								<p className="text-gray-500">{item.variantTitle}</p>
							</div>
						)}
						<p className="mt-1 text-sm font-medium text-gray-900">{formatPrice(item.price, item.currency)}</p>
					</div>

					<div className="mt-4 sm:mt-0 sm:pr-9">
						<div className="grid w-full max-w-16 grid-cols-1">
							<select
								value={item.quantity}
								onChange={(e) => updateQuantity(item.variantId, Number(e.target.value))}
								aria-label={t('cart.quantityLabel', { title: item.title })}
								className="col-start-1 row-start-1 appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-brand sm:text-sm"
							>
								{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
									<option key={n} value={n}>{n}</option>
								))}
							</select>
							<svg className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
								<path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
							</svg>
						</div>

						<div className="absolute top-0 right-0">
							<button
								type="button"
								onClick={() => removeFromCart(item.variantId)}
								className="-m-2 inline-flex p-2 text-gray-400 hover:text-gray-500"
							>
								<span className="sr-only">{t('common.remove')}</span>
								<svg className="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
									<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>
		</li>
	);
}

function CouponInput() {
	const { t } = useTranslation();
	const [code, setCode] = useState('');
	const [isApplying, setIsApplying] = useState(false);
	const [error, setError] = useState('');
	const appliedCoupon = useStore($appliedCoupon);
	const cartTotal = useStore($cartTotal);

	const handleApply = async () => {
		if (!code.trim()) return;

		setIsApplying(true);
		setError('');

		try {
			const data = await fetchJson<{
				valid: boolean;
				coupon?: AppliedCoupon;
				message?: string;
			}>(`${getApiBase()}/checkout/validate-coupon`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: code.trim(), cartTotal })
			});

			if (data.valid && data.coupon) {
				applyCoupon(data.coupon);
				setCode('');
			} else {
				setError(data.message || t('cart.invalidCoupon'));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : t('cart.failedToApplyCoupon'));
		} finally {
			setIsApplying(false);
		}
	};

	if (appliedCoupon) {
		return (
			<div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-4 py-2">
				<div>
					<span className="text-sm font-medium text-green-900">
						{appliedCoupon.code}
					</span>
					<span className="text-xs text-green-700 ml-2">
						-{formatPrice(appliedCoupon.discountAmount, 'JPY')}
					</span>
				</div>
				<button
					onClick={removeCoupon}
					className="text-sm text-green-700 hover:text-green-900"
				>
					{t('cart.removeCoupon')}
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<input
					type="text"
					value={code}
					onChange={(e) => setCode(e.target.value.toUpperCase())}
					placeholder={t('cart.couponPlaceholder')}
					className="flex-1 rounded-md border-gray-300 px-4 py-2 text-sm focus:border-brand focus:ring-brand"
					disabled={isApplying}
				/>
				<button
					onClick={handleApply}
					disabled={isApplying || !code.trim()}
					className="px-4 py-2 bg-gray-100 text-sm font-medium rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{isApplying ? t('cart.applying') : t('cart.applyCoupon')}
				</button>
			</div>
			{error && (
				<p className="text-sm text-red-600" role="alert">{error}</p>
			)}
		</div>
	);
}

function OrderSummary({
	subtotal,
	taxAmount,
	cartTotal,
	discount,
	shipping,
	grandTotal,
	currency,
	onCheckout
}: {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shipping: number;
	grandTotal: number;
	currency: string;
	onCheckout: () => void;
}) {
	const { t } = useTranslation();
	const shippingConfig = useStore($shippingConfig);
	const remainingForFreeShipping = Math.max(0, shippingConfig.freeShippingThreshold - cartTotal);

	return (
		<section aria-labelledby="summary-heading" className="mt-16 rounded-lg bg-gray-50 px-4 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
			<h2 id="summary-heading" className="text-lg font-medium text-gray-900">{t('cart.orderSummary')}</h2>

			<dl className="mt-6 space-y-4">
				<div className="flex items-center justify-between">
					<dt className="text-sm text-gray-600">{t('cart.subtotal')}</dt>
					<dd className="text-sm font-medium text-gray-900">{formatPrice(subtotal, currency)}</dd>
				</div>

				<div className="flex items-center justify-between">
					<dt className="text-sm text-gray-600">{t('cart.tax')}</dt>
					<dd className="text-sm font-medium text-gray-900">{formatPrice(taxAmount, currency)}</dd>
				</div>

				{/* Coupon Input */}
				<div className="border-t border-gray-200 pt-4">
					<dt className="text-sm text-gray-600 mb-2">{t('cart.couponCode')}</dt>
					<CouponInput />
				</div>

				{/* Discount Display */}
				{discount > 0 && (
					<div className="flex items-center justify-between text-green-600">
						<dt className="text-sm">{t('cart.discount')}</dt>
						<dd className="text-sm font-medium">-{formatPrice(discount, currency)}</dd>
					</div>
				)}

				{/* Shipping */}
				<div className="flex items-center justify-between border-t border-gray-200 pt-4">
					<dt className="text-sm text-gray-600">{t('cart.shipping')}</dt>
					<dd className="text-sm font-medium text-gray-900">
						{shipping === 0 ? (
							<span className="text-green-600 font-semibold">{t('common.free').toUpperCase()}</span>
						) : (
							formatPrice(shipping, currency)
						)}
					</dd>
				</div>

				{/* Order Total */}
				<div className="flex items-center justify-between border-t border-gray-200 pt-4">
					<dt className="text-base font-medium text-gray-900">{t('cart.orderTotal')}</dt>
					<dd className="text-base font-medium text-gray-900">{formatPrice(grandTotal, currency)}</dd>
				</div>
			</dl>

			{remainingForFreeShipping > 0 && (
				<div className="mt-4 text-sm text-gray-500 text-center">
					{t('cart.addForFreeShipping', { amount: formatPrice(remainingForFreeShipping, currency) })}
				</div>
			)}

			<div className="mt-6 space-y-3">
				<button
					type="button"
					onClick={onCheckout}
					className="w-full rounded-md border border-transparent bg-brand px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-brand-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-50 transition-colors"
				>
					{t('cart.checkout')}
				</button>
				<a
					href="/quotations/new"
					className="w-full block rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-50 transition-colors text-center"
				>
					{t('cart.createQuotation')}
				</a>
			</div>

			<div className="mt-6 text-center text-sm">
				<p>
					{t('common.or')}{' '}
					<a href="/products" className="font-medium text-brand hover:text-brand-active">
						{t('cart.continueShopping')}
						<span aria-hidden="true"> &rarr;</span>
					</a>
				</p>
			</div>
		</section>
	);
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

	// Track item deletions and move focus to next item
	useEffect(() => {
		const prevItems = prevItemsRef.current;
		if (prevItems.length > items.length && items.length > 0) {
			// An item was removed - find which one
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

	// Fetch shipping config on mount
	useEffect(() => {
		const fetchShippingConfig = async () => {
			try {
				const data = await fetchJson<{
					shippingFee: number;
					freeShippingThreshold: number;
				}>(
					`${getApiBase()}/checkout/config`
				);
				if (data.shippingFee !== undefined && data.freeShippingThreshold !== undefined) {
					setShippingConfig(data);
				}
			} catch {
				// Use default values from store
			}
		};

		fetchShippingConfig();
	}, []);

	const handleCheckout = () => {
		if (items.length === 0) return;

		// Redirect to new checkout page with Payment Element
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
				<ul role="list" className="divide-y divide-gray-200 border-t border-b border-gray-200">
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

			<OrderSummary
				subtotal={subtotal}
				taxAmount={taxAmount}
				cartTotal={cartTotal}
				discount={discount}
				shipping={shipping}
				grandTotal={grandTotal}
				currency={currency}
				onCheckout={handleCheckout}
			/>
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
