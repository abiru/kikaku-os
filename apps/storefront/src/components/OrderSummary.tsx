import { useState } from 'react';
import { useTranslation } from '../i18n';
import type { CartItem } from '../lib/cart';
import { formatPrice } from '../lib/format';

type QuoteBreakdown = {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shippingFee: number;
	grandTotal: number;
	currency: string;
};

type OrderSummaryProps = {
	items: CartItem[];
	breakdown: QuoteBreakdown | null;
	onCouponApply: (couponCode?: string) => Promise<void>;
};

export default function OrderSummary({ items, breakdown, onCouponApply }: OrderSummaryProps) {
	const { t } = useTranslation();
	const [showCouponInput, setShowCouponInput] = useState(false);
	const [couponCode, setCouponCode] = useState('');
	const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
	const [couponError, setCouponError] = useState<string | null>(null);

	const handleApplyCoupon = async () => {
		if (!couponCode.trim()) {
			setCouponError(t('checkout.couponRequired'));
			return;
		}

		setIsApplyingCoupon(true);
		setCouponError(null);

		try {
			await onCouponApply(couponCode.trim());
			setShowCouponInput(false);
		} catch (err) {
			setCouponError(err instanceof Error ? err.message : t('checkout.couponInvalid'));
		} finally {
			setIsApplyingCoupon(false);
		}
	};

	const currency = breakdown?.currency || 'JPY';

	return (
		<div className="bg-white rounded-lg shadow-sm p-6 md:sticky md:top-8">
			<h2 className="text-lg font-medium text-gray-900 mb-6">
				{t('checkout.orderSummary')}
			</h2>

			{/* Order items */}
			<div className="space-y-4 mb-6">
				{items.map((item) => (
					<div key={item.variantId} className="flex justify-between">
						<div className="flex-1">
							<p className="text-sm font-medium text-gray-900">
								{item.title}
								{item.variantTitle && item.variantTitle !== 'Default' && (
									<span className="text-gray-500"> - {item.variantTitle}</span>
								)}
							</p>
							<p className="text-sm text-gray-500">{t('checkout.quantity')}: {item.quantity}</p>
						</div>
						<p className="text-sm font-medium text-gray-900">
							{formatPrice(item.price * item.quantity, currency)}
						</p>
					</div>
				))}
			</div>

			{/* Coupon section */}
			<div className="border-t border-gray-200 pt-4 mb-4">
				{!showCouponInput ? (
					<button
						type="button"
						onClick={() => setShowCouponInput(true)}
						className="text-sm text-brand hover:text-brand-active font-medium min-h-[44px] flex items-center touch-manipulation"
					>
						{t('checkout.haveCoupon')}
					</button>
				) : (
					<div className="space-y-3">
						<div className="flex gap-2">
							<input
								type="text"
								value={couponCode}
								onChange={(e) => setCouponCode(e.target.value)}
								placeholder={t('checkout.enterCoupon')}
								className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-brand focus:ring-brand text-base px-3 py-2 border min-h-[44px]"
							/>
							<button
								type="button"
								onClick={handleApplyCoupon}
								disabled={isApplyingCoupon}
								className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
							>
								{isApplyingCoupon ? '...' : t('checkout.apply')}
							</button>
						</div>
						{couponError && (
							<p className="text-sm text-red-600" role="alert">{couponError}</p>
						)}
						<button
							type="button"
							onClick={() => {
								setShowCouponInput(false);
								setCouponCode('');
								setCouponError(null);
							}}
							className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] flex items-center touch-manipulation"
						>
							{t('checkout.cancel')}
						</button>
					</div>
				)}
			</div>

			{/* Price breakdown */}
			{breakdown && (
				<div className="border-t border-gray-200 pt-4 space-y-2">
					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.subtotal')}</span>
						<span>{formatPrice(breakdown.subtotal, currency)}</span>
					</div>

					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.tax')}</span>
						<span>{formatPrice(breakdown.taxAmount, currency)}</span>
					</div>

					{breakdown.discount > 0 && (
						<div className="flex justify-between text-sm text-green-600">
							<span>{t('checkout.discount')}</span>
							<span>-{formatPrice(breakdown.discount, currency)}</span>
						</div>
					)}

					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.shipping')}</span>
						<span>
							{breakdown.shippingFee === 0
								? t('checkout.free')
								: formatPrice(breakdown.shippingFee, currency)}
						</span>
					</div>

					<div className="flex justify-between text-lg font-semibold text-gray-900 pt-4 border-t border-gray-200">
						<span>{t('checkout.total')}</span>
						<span>{formatPrice(breakdown.grandTotal, currency)}</span>
					</div>
				</div>
			)}

			{!breakdown && (
				<div className="border-t border-gray-200 pt-4">
					<div className="animate-pulse space-y-2">
						<div className="h-4 bg-gray-200 rounded"></div>
						<div className="h-4 bg-gray-200 rounded"></div>
						<div className="h-4 bg-gray-200 rounded w-3/4"></div>
					</div>
				</div>
			)}
		</div>
	);
}
