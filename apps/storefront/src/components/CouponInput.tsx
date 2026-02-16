import { useStore } from '@nanostores/react';
import { useState } from 'react';
import {
	$appliedCoupon,
	$cartTotal,
	applyCoupon,
	removeCoupon,
	type AppliedCoupon,
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useTranslation } from '../i18n';
import { formatPrice } from '../lib/format';

export function CouponInput() {
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
				body: JSON.stringify({ code: code.trim(), cartTotal }),
			});

			if (data.valid && data.coupon) {
				applyCoupon(data.coupon);
				setCode('');
			} else {
				setError(data.message || t('cart.invalidCoupon'));
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : t('cart.failedToApplyCoupon')
			);
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
				<p className="text-sm text-red-600" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
