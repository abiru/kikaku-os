import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
	logError: vi.fn(),
}));

import { handleCouponPost } from './coupon-actions';

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.append(key, value);
	}
	return fd;
}

const mockT = (key: string) => key;

describe('handleCouponPost', () => {
	const apiBase = 'http://localhost:8787';
	const apiKey = 'test-key';
	const id = '10';

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe('delete action', () => {
		it('sends DELETE and redirects on success', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

			const fd = createFormData({ _action: 'delete' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.redirect).toBe('/admin/coupons');
			expect(result.error).toBeNull();
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8787/admin/coupons/10',
				expect.objectContaining({ method: 'DELETE' })
			);
		});

		it('returns error on delete failure', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Cannot delete' }),
			});

			const fd = createFormData({ _action: 'delete' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('Cannot delete');
			expect(result.redirect).toBeNull();
		});
	});

	describe('toggle action', () => {
		it('sends POST to toggle endpoint on success', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

			const fd = createFormData({ _action: 'toggle' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBeNull();
			expect(result.redirect).toBeNull();
			expect(global.fetch).toHaveBeenCalledWith(
				'http://localhost:8787/admin/coupons/10/toggle',
				expect.objectContaining({ method: 'POST' })
			);
		});

		it('returns error on toggle failure', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Toggle failed' }),
			});

			const fd = createFormData({ _action: 'toggle' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('Toggle failed');
		});
	});

	describe('update action', () => {
		it('returns error when code is empty', async () => {
			const fd = createFormData({ code: '', value: '10', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('errors.codeRequired');
		});

		it('returns error when value is zero', async () => {
			const fd = createFormData({ code: 'SALE', value: '0', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('errors.valuePositive');
		});

		it('returns error when value is not a number', async () => {
			const fd = createFormData({ code: 'SALE', value: 'abc', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('errors.valuePositive');
		});

		it('returns error when percentage exceeds 100', async () => {
			const fd = createFormData({ code: 'SALE', value: '150', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('errors.percentageMax');
		});

		it('allows fixed amount over 100', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ coupon: { id: 10 } }),
			});

			const fd = createFormData({ code: 'BIG', value: '500', type: 'fixed' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBeNull();
			expect(result.successMessage).toBe('admin.couponUpdated');
		});

		it('sends PUT request with correct body', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ coupon: { id: 10 } }),
			});

			const fd = createFormData({
				code: 'summer',
				type: 'percentage',
				value: '20',
				min_order_amount: '3000',
				max_uses: '100',
				uses_per_customer: '2',
				status: 'active',
				starts_at: '2026-01-01',
				expires_at: '2026-12-31',
			});

			await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
			const body = JSON.parse(fetchCall[1].body);
			expect(body.code).toBe('SUMMER');
			expect(body.value).toBe(20);
			expect(body.min_order_amount).toBe(3000);
			expect(body.max_uses).toBe(100);
			expect(body.uses_per_customer).toBe(2);
			expect(body.starts_at).toBe('2026-01-01');
			expect(body.expires_at).toBe('2026-12-31');
		});

		it('sends null for empty optional fields', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ coupon: { id: 10 } }),
			});

			const fd = createFormData({
				code: 'SALE',
				value: '10',
				type: 'percentage',
			});

			await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
			const body = JSON.parse(fetchCall[1].body);
			expect(body.max_uses).toBeNull();
			expect(body.starts_at).toBeNull();
			expect(body.expires_at).toBeNull();
		});

		it('returns error from API response', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Code already exists' }),
			});

			const fd = createFormData({ code: 'SALE', value: '10', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('Code already exists');
		});

		it('returns connection error on network failure', async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network error')
			);

			const fd = createFormData({ code: 'SALE', value: '10', type: 'percentage' });
			const result = await handleCouponPost(fd, apiBase, apiKey, id, mockT);

			expect(result.error).toBe('errors.failedToUpdateCoupon');
		});
	});
});
