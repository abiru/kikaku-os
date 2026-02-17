import { describe, it, expect, vi } from 'vitest';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

import {
	getInquiryBadgeColor,
	getInquiryStatusLabel,
	getOrderBadgeColor,
	getPaymentStatusLabel,
	getFulfillmentStatusLabel,
	getEventBadgeColor,
	getReviewBadgeColor,
	getInventoryBadgeColor,
	getInventoryStatusLabel,
	getFulfillmentBadgeColor,
	getShippingBadgeColor,
	getShippingStatusLabel,
	getReviewStatusLabel,
	getProductBadgeColor,
} from './adminUtils';

describe('adminUtils', () => {
	describe('getInquiryBadgeColor', () => {
		it('returns amber for open', () => {
			expect(getInquiryBadgeColor('open')).toBe('amber');
		});

		it('returns lime for replied', () => {
			expect(getInquiryBadgeColor('replied')).toBe('lime');
		});

		it('returns zinc for closed', () => {
			expect(getInquiryBadgeColor('closed')).toBe('zinc');
		});

		it('returns zinc for unknown status', () => {
			expect(getInquiryBadgeColor('unknown')).toBe('zinc');
		});
	});

	describe('getInquiryStatusLabel', () => {
		it('returns translated label for open', () => {
			expect(getInquiryStatusLabel('open')).toBe('admin.inquiryStatusOpen');
		});

		it('returns translated label for replied', () => {
			expect(getInquiryStatusLabel('replied')).toBe('admin.inquiryStatusReplied');
		});

		it('returns translated label for closed', () => {
			expect(getInquiryStatusLabel('closed')).toBe('admin.inquiryStatusClosed');
		});

		it('returns raw status for unknown', () => {
			expect(getInquiryStatusLabel('archived')).toBe('archived');
		});
	});

	describe('getOrderBadgeColor', () => {
		it('returns lime for paid', () => {
			expect(getOrderBadgeColor('paid')).toBe('lime');
		});

		it('returns amber for pending', () => {
			expect(getOrderBadgeColor('pending')).toBe('amber');
		});

		it('returns red for refunded', () => {
			expect(getOrderBadgeColor('refunded')).toBe('red');
		});

		it('returns zinc for unknown', () => {
			expect(getOrderBadgeColor('other')).toBe('zinc');
		});
	});

	describe('getPaymentStatusLabel', () => {
		it('returns translated label for paid', () => {
			expect(getPaymentStatusLabel('paid')).toBe('admin.paid');
		});

		it('returns translated label for pending', () => {
			expect(getPaymentStatusLabel('pending')).toBe('admin.pending');
		});

		it('returns translated label for refunded', () => {
			expect(getPaymentStatusLabel('refunded')).toBe('admin.refunded');
		});

		it('returns raw status for unknown', () => {
			expect(getPaymentStatusLabel('cancelled')).toBe('cancelled');
		});
	});

	describe('getFulfillmentStatusLabel', () => {
		it('returns fulfilled for shipped', () => {
			expect(getFulfillmentStatusLabel('shipped')).toBe('admin.fulfilled');
		});

		it('returns unfulfilled for null', () => {
			expect(getFulfillmentStatusLabel(null)).toBe('admin.unfulfilled');
		});

		it('returns unfulfilled for empty string', () => {
			expect(getFulfillmentStatusLabel('')).toBe('admin.unfulfilled');
		});

		it('returns raw status for unknown', () => {
			expect(getFulfillmentStatusLabel('processing')).toBe('processing');
		});
	});

	describe('getEventBadgeColor', () => {
		it('returns lime for completed', () => {
			expect(getEventBadgeColor('completed')).toBe('lime');
		});

		it('returns amber for pending', () => {
			expect(getEventBadgeColor('pending')).toBe('amber');
		});

		it('returns red for failed', () => {
			expect(getEventBadgeColor('failed')).toBe('red');
		});

		it('returns zinc for unknown', () => {
			expect(getEventBadgeColor('other')).toBe('zinc');
		});
	});

	describe('getReviewBadgeColor', () => {
		it('returns amber for pending', () => {
			expect(getReviewBadgeColor('pending')).toBe('amber');
		});

		it('returns lime for approved', () => {
			expect(getReviewBadgeColor('approved')).toBe('lime');
		});

		it('returns red for rejected', () => {
			expect(getReviewBadgeColor('rejected')).toBe('red');
		});

		it('returns zinc for unknown', () => {
			expect(getReviewBadgeColor('other')).toBe('zinc');
		});
	});

	describe('getInventoryBadgeColor', () => {
		it('returns lime for ok', () => {
			expect(getInventoryBadgeColor('ok')).toBe('lime');
		});

		it('returns amber for low', () => {
			expect(getInventoryBadgeColor('low')).toBe('amber');
		});

		it('returns red for out', () => {
			expect(getInventoryBadgeColor('out')).toBe('red');
		});

		it('returns zinc for unknown', () => {
			expect(getInventoryBadgeColor('other')).toBe('zinc');
		});
	});

	describe('getInventoryStatusLabel', () => {
		it('returns OK for ok', () => {
			expect(getInventoryStatusLabel('ok')).toBe('OK');
		});

		it('returns Low for low', () => {
			expect(getInventoryStatusLabel('low')).toBe('Low');
		});

		it('returns Out for out', () => {
			expect(getInventoryStatusLabel('out')).toBe('Out');
		});

		it('returns raw status for unknown', () => {
			expect(getInventoryStatusLabel('other')).toBe('other');
		});
	});

	describe('getFulfillmentBadgeColor', () => {
		it('returns lime for shipped', () => {
			expect(getFulfillmentBadgeColor('shipped')).toBe('lime');
		});

		it('returns zinc for null', () => {
			expect(getFulfillmentBadgeColor(null)).toBe('zinc');
		});

		it('returns zinc for unshipped', () => {
			expect(getFulfillmentBadgeColor('pending')).toBe('zinc');
		});
	});

	describe('getShippingBadgeColor', () => {
		it('returns blue for shipped', () => {
			expect(getShippingBadgeColor('shipped')).toBe('blue');
		});

		it('returns yellow for processing', () => {
			expect(getShippingBadgeColor('processing')).toBe('yellow');
		});

		it('returns green for delivered', () => {
			expect(getShippingBadgeColor('delivered')).toBe('green');
		});

		it('returns zinc for null', () => {
			expect(getShippingBadgeColor(null)).toBe('zinc');
		});

		it('returns zinc for unknown', () => {
			expect(getShippingBadgeColor('other')).toBe('zinc');
		});
	});

	describe('getShippingStatusLabel', () => {
		it('returns translated label for shipped', () => {
			expect(getShippingStatusLabel('shipped')).toBe('admin.shippingStatusShipped');
		});

		it('returns translated label for processing', () => {
			expect(getShippingStatusLabel('processing')).toBe('admin.shippingStatusProcessing');
		});

		it('returns translated label for delivered', () => {
			expect(getShippingStatusLabel('delivered')).toBe('admin.shippingStatusDelivered');
		});

		it('returns unfulfilled for null', () => {
			expect(getShippingStatusLabel(null)).toBe('admin.shippingStatusUnfulfilled');
		});
	});

	describe('getReviewStatusLabel', () => {
		it('returns translated label for pending', () => {
			expect(getReviewStatusLabel('pending')).toBe('reviews.pendingReview');
		});

		it('returns translated label for approved', () => {
			expect(getReviewStatusLabel('approved')).toBe('reviews.approved');
		});

		it('returns translated label for rejected', () => {
			expect(getReviewStatusLabel('rejected')).toBe('reviews.rejected');
		});

		it('returns raw status for unknown', () => {
			expect(getReviewStatusLabel('flagged')).toBe('flagged');
		});
	});

	describe('getProductBadgeColor', () => {
		it('returns lime for active', () => {
			expect(getProductBadgeColor('active')).toBe('lime');
		});

		it('returns zinc for draft', () => {
			expect(getProductBadgeColor('draft')).toBe('zinc');
		});

		it('returns red for archived', () => {
			expect(getProductBadgeColor('archived')).toBe('red');
		});

		it('returns zinc for unknown', () => {
			expect(getProductBadgeColor('other')).toBe('zinc');
		});
	});
});
