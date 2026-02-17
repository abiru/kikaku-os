import { useStore } from '@nanostores/react';
import { $shippingConfig } from '../lib/cart';
import { useTranslation } from '../i18n';
import { formatPrice } from '../lib/format';
import { CouponInput } from './CouponInput';

type CartOrderSummaryProps = {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shipping: number;
	grandTotal: number;
	currency: string;
	onCheckout: () => void;
	checkoutDisabled?: boolean;
};

export function CartOrderSummary({
	subtotal,
	taxAmount,
	cartTotal,
	discount,
	shipping,
	grandTotal,
	currency,
	onCheckout,
	checkoutDisabled = false,
}: CartOrderSummaryProps) {
	const { t } = useTranslation();
	const shippingConfig = useStore($shippingConfig);
	const remainingForFreeShipping = Math.max(
		0,
		shippingConfig.freeShippingThreshold - cartTotal
	);

	const progressPercent = shippingConfig.freeShippingThreshold > 0
		? Math.min(100, (cartTotal / shippingConfig.freeShippingThreshold) * 100)
		: 100;

	return (
		<section
			aria-labelledby="summary-heading"
			className="bg-subtle rounded-2xl shadow-card ring-1 ring-black/5 px-4 py-6 sm:p-6 lg:p-8"
		>
			<h2 id="summary-heading" className="text-lg font-medium text-neutral-900">
				{t('cart.orderSummary')}
			</h2>

			<dl className="mt-6 space-y-4">
				<div className="flex items-center justify-between">
					<dt className="text-sm text-neutral-600">{t('cart.subtotal')}</dt>
					<dd className="text-sm font-medium text-neutral-900">
						{formatPrice(subtotal, currency)}
					</dd>
				</div>

				<div className="flex items-center justify-between">
					<dt className="text-sm text-neutral-600">{t('cart.tax')}</dt>
					<dd className="text-sm font-medium text-neutral-900">
						{formatPrice(taxAmount, currency)}
					</dd>
				</div>

				{/* Coupon Input */}
				<div className="border-t border-neutral-200 pt-4">
					<dt className="text-sm text-neutral-600 mb-2">
						{t('cart.couponCode')}
					</dt>
					<CouponInput />
				</div>

				{/* Discount Display */}
				{discount > 0 && (
					<div className="flex items-center justify-between text-success">
						<dt className="text-sm">{t('cart.discount')}</dt>
						<dd className="text-sm font-medium">
							-{formatPrice(discount, currency)}
						</dd>
					</div>
				)}

				{/* Shipping */}
				<div className="flex items-center justify-between border-t border-neutral-200 pt-4">
					<dt className="text-sm text-neutral-600">{t('cart.shipping')}</dt>
					<dd className="text-sm font-medium text-neutral-900">
						{shipping === 0 ? (
							<span className="text-success font-semibold">
								{t('common.free').toUpperCase()}
							</span>
						) : (
							formatPrice(shipping, currency)
						)}
					</dd>
				</div>

				{/* Free Shipping Threshold Message */}
				{remainingForFreeShipping > 0 && (
					<div className="border-t border-neutral-200 pt-4">
						<p className="text-sm text-brand text-center font-medium">
							{t('cart.addForFreeShipping', {
								amount: formatPrice(remainingForFreeShipping, currency),
							})}
						</p>
						<div className="mt-2 h-1.5 bg-neutral-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
							<div className="h-full bg-brand rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
						</div>
					</div>
				)}

				{/* Order Total */}
				<div className="flex items-center justify-between border-t border-neutral-200 pt-4">
					<dt className="text-base font-medium text-neutral-900">
						{t('cart.orderTotal')}
					</dt>
					<dd className="text-base font-medium text-neutral-900">
						{formatPrice(grandTotal, currency)}
					</dd>
				</div>
			</dl>

			<div className="mt-6 space-y-3">
				<button
					type="button"
					onClick={onCheckout}
					disabled={checkoutDisabled}
					className={`w-full rounded-full border border-transparent px-4 py-4 text-lg font-medium text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 ${checkoutDisabled ? 'bg-neutral-400 cursor-not-allowed' : 'bg-brand hover:bg-brand-active active:scale-[0.98]'}`}
				>
					<svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
					</svg>
					{t('cart.checkout')}
				</button>
				<a
					href="/quotations/new"
					className="w-full block rounded-full border border-neutral-300 bg-white px-4 py-3 text-base font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-colors text-center"
				>
					{t('cart.createQuotation')}
				</a>
			</div>

			<div className="mt-6 text-center text-sm">
				<p>
					{t('common.or')}{' '}
					<a
						href="/products"
						className="font-medium text-brand hover:text-brand-active"
					>
						{t('cart.continueShopping')}
						<span aria-hidden="true"> &rarr;</span>
					</a>
				</p>
			</div>
		</section>
	);
}
