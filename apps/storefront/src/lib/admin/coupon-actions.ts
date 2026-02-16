import { logError } from '../logger';

type Coupon = {
	id: number;
	code: string;
	type: string;
	value: number;
	currency: string;
	min_order_amount: number;
	max_uses: number | null;
	uses_per_customer: number;
	current_uses: number;
	status: string;
	starts_at: string | null;
	expires_at: string | null;
	created_at: string;
	updated_at: string;
};

type CouponActionResult = {
	coupon: Coupon | null;
	error: string | null;
	successMessage: string | null;
	redirect: string | null;
};

export async function handleCouponPost(
	formData: FormData,
	apiBase: string,
	apiKey: string,
	id: string,
	t: (key: string) => string,
): Promise<CouponActionResult> {
	const action = formData.get('_action')?.toString();

	if (action === 'delete') {
		const res = await fetch(`${apiBase}/admin/coupons/${id}`, {
			method: 'DELETE',
			headers: { 'x-admin-key': apiKey },
		});

		if (res.ok) {
			return { coupon: null, error: null, successMessage: null, redirect: '/admin/coupons' };
		}
		const data = await res.json();
		return { coupon: null, error: data.message || t('errors.failedToUpdateCoupon'), successMessage: null, redirect: null };
	}

	if (action === 'toggle') {
		const res = await fetch(`${apiBase}/admin/coupons/${id}/toggle`, {
			method: 'POST',
			headers: { 'x-admin-key': apiKey },
		});

		if (!res.ok) {
			const data = await res.json();
			return { coupon: null, error: data.message || t('errors.failedToUpdateCoupon'), successMessage: null, redirect: null };
		}
		return { coupon: null, error: null, successMessage: null, redirect: null };
	}

	// Update coupon
	const code = formData.get('code')?.toString().trim().toUpperCase() || '';
	const type = formData.get('type')?.toString() || 'percentage';
	const valueStr = formData.get('value')?.toString() || '';
	const minOrderStr = formData.get('min_order_amount')?.toString() || '0';
	const maxUsesStr = formData.get('max_uses')?.toString() || '';
	const usesPerCustomerStr = formData.get('uses_per_customer')?.toString() || '1';
	const status = formData.get('status')?.toString() || 'active';
	const starts_at = formData.get('starts_at')?.toString() || '';
	const expires_at = formData.get('expires_at')?.toString() || '';

	const value = parseInt(valueStr, 10);
	const min_order_amount = parseInt(minOrderStr, 10) || 0;
	const max_uses = maxUsesStr ? parseInt(maxUsesStr, 10) : null;
	const uses_per_customer = parseInt(usesPerCustomerStr, 10) || 1;

	if (!code) {
		return { coupon: null, error: t('errors.codeRequired'), successMessage: null, redirect: null };
	}
	if (isNaN(value) || value <= 0) {
		return { coupon: null, error: t('errors.valuePositive'), successMessage: null, redirect: null };
	}
	if (type === 'percentage' && value > 100) {
		return { coupon: null, error: t('errors.percentageMax'), successMessage: null, redirect: null };
	}

	try {
		const res = await fetch(`${apiBase}/admin/coupons/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'x-admin-key': apiKey,
			},
			body: JSON.stringify({
				code,
				type,
				value,
				currency: 'JPY',
				min_order_amount,
				max_uses,
				uses_per_customer,
				status,
				starts_at: starts_at || null,
				expires_at: expires_at || null,
			}),
		});

		const data = await res.json();

		if (!res.ok) {
			return { coupon: null, error: data.message || t('errors.failedToUpdateCoupon'), successMessage: null, redirect: null };
		}

		return { coupon: data.coupon, error: null, successMessage: t('admin.couponUpdated'), redirect: null };
	} catch (e) {
		logError('Failed to update coupon', e, { page: 'lib/admin/coupon-actions', action: 'updateCoupon', resourceId: id });
		return { coupon: null, error: t('errors.failedToUpdateCoupon'), successMessage: null, redirect: null };
	}
}
