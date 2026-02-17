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

	return (
		<section
			aria-labelledby="summary-heading"
			className="rounded-lg bg-gray-50 px-4 py-6 sm:p-6 lg:p-8"
		>
			<h2 id="summary-heading" className="text-lg font-medium text-gray-900">
				{t('cart.orderSummary')}
			</h2>

			<dl className="mt-6 space-y-4">
				<div className="flex items-center justify-between">
					<dt className="text-sm text-gray-600">{t('cart.subtotal')}</dt>
					<dd className="text-sm font-medium text-gray-900">
						{formatPrice(subtotal, currency)}
					</dd>
				</div>

				<div className="flex items-center justify-between">
					<dt className="text-sm text-gray-600">{t('cart.tax')}</dt>
					<dd className="text-sm font-medium text-gray-900">
						{formatPrice(taxAmount, currency)}
					</dd>
				</div>

				{/* Coupon Input */}
				<div className="border-t border-gray-200 pt-4">
					<dt className="text-sm text-gray-600 mb-2">
						{t('cart.couponCode')}
					</dt>
					<CouponInput />
				</div>

				{/* Discount Display */}
				{discount > 0 && (
					<div className="flex items-center justify-between text-green-600">
						<dt className="text-sm">{t('cart.discount')}</dt>
						<dd className="text-sm font-medium">
							-{formatPrice(discount, currency)}
						</dd>
					</div>
				)}

				{/* Shipping */}
				<div className="flex items-center justify-between border-t border-gray-200 pt-4">
					<dt className="text-sm text-gray-600">{t('cart.shipping')}</dt>
					<dd className="text-sm font-medium text-gray-900">
						{shipping === 0 ? (
							<span className="text-green-600 font-semibold">
								{t('common.free').toUpperCase()}
							</span>
						) : (
							formatPrice(shipping, currency)
						)}
					</dd>
				</div>

				{/* Order Total */}
				<div className="flex items-center justify-between border-t border-gray-200 pt-4">
					<dt className="text-base font-medium text-gray-900">
						{t('cart.orderTotal')}
					</dt>
					<dd className="text-base font-medium text-gray-900">
						{formatPrice(grandTotal, currency)}
					</dd>
				</div>
			</dl>

			{remainingForFreeShipping > 0 && (
				<div className="mt-4 text-sm text-gray-500 text-center">
					{t('cart.addForFreeShipping', {
						amount: formatPrice(remainingForFreeShipping, currency),
					})}
				</div>
			)}

			<div className="mt-6 space-y-3">
				<button
					type="button"
					onClick={onCheckout}
					disabled={checkoutDisabled}
					className={`w-full rounded-full border border-transparent px-4 py-3 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-50 transition-colors ${checkoutDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand hover:bg-brand-active'}`}
				>
					{t('cart.checkout')}
				</button>
				<a
					href="/quotations/new"
					className="w-full block rounded-full border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-50 transition-colors text-center"
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
