import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n — return the key so tests are language-independent
vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

import OrderSummary from '../components/OrderSummary';
import type { CartItem } from '../lib/cart';

const mockItems: CartItem[] = [
	{
		variantId: 1,
		productId: 100,
		title: 'LED Panel Light',
		variantTitle: 'Large',
		price: 5000,
		currency: 'JPY',
		quantity: 2,
		taxRate: 0.10,
	},
	{
		variantId: 2,
		productId: 200,
		title: 'LED Strip',
		variantTitle: 'Default',
		price: 1500,
		currency: 'JPY',
		quantity: 1,
		taxRate: 0.10,
	},
];

const mockBreakdown = {
	subtotal: 10454,
	taxAmount: 1046,
	cartTotal: 11500,
	discount: 0,
	shippingFee: 500,
	grandTotal: 12000,
	currency: 'JPY',
};

describe('OrderSummary', () => {
	const mockOnCouponApply = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders order items', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('LED Panel Light')).toBeInTheDocument();
		expect(screen.getByText('LED Strip')).toBeInTheDocument();
	});

	it('shows variant title for non-Default variants', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText(/Large/)).toBeInTheDocument();
		expect(screen.queryByText(/- Default/)).not.toBeInTheDocument();
	});

	it('shows price breakdown when provided', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('checkout.subtotal')).toBeInTheDocument();
		expect(screen.getByText('checkout.tax')).toBeInTheDocument();
		expect(screen.getByText('checkout.shipping')).toBeInTheDocument();
		expect(screen.getByText('checkout.total')).toBeInTheDocument();
	});

	it('shows free shipping text when shippingFee is 0', () => {
		const breakdownWithFreeShipping = { ...mockBreakdown, shippingFee: 0 };

		render(
			<OrderSummary
				items={mockItems}
				breakdown={breakdownWithFreeShipping}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('checkout.free')).toBeInTheDocument();
	});

	it('shows discount when discount > 0', () => {
		const breakdownWithDiscount = { ...mockBreakdown, discount: 500, grandTotal: 11500 };

		render(
			<OrderSummary
				items={mockItems}
				breakdown={breakdownWithDiscount}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('checkout.discount')).toBeInTheDocument();
	});

	it('does not show discount when discount is 0', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.queryByText('checkout.discount')).not.toBeInTheDocument();
	});

	it('shows loading skeleton when breakdown is null', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={null}
				onCouponApply={mockOnCouponApply}
			/>
		);

		const skeleton = document.querySelector('.animate-pulse');
		expect(skeleton).toBeInTheDocument();
		expect(screen.queryByText('checkout.subtotal')).not.toBeInTheDocument();
	});

	it('shows coupon button initially', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('checkout.haveCoupon')).toBeInTheDocument();
	});

	it('shows coupon input when clicking coupon button', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		fireEvent.click(screen.getByText('checkout.haveCoupon'));

		expect(screen.getByPlaceholderText('checkout.enterCoupon')).toBeInTheDocument();
		expect(screen.getByText('checkout.apply')).toBeInTheDocument();
		expect(screen.getByText('checkout.cancel')).toBeInTheDocument();
	});

	it('hides coupon input when clicking cancel', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		fireEvent.click(screen.getByText('checkout.haveCoupon'));
		expect(screen.getByPlaceholderText('checkout.enterCoupon')).toBeInTheDocument();

		fireEvent.click(screen.getByText('checkout.cancel'));
		expect(screen.queryByPlaceholderText('checkout.enterCoupon')).not.toBeInTheDocument();
	});

	it('renders heading', () => {
		render(
			<OrderSummary
				items={mockItems}
				breakdown={mockBreakdown}
				onCouponApply={mockOnCouponApply}
			/>
		);

		expect(screen.getByText('checkout.orderSummary')).toBeInTheDocument();
	});
});
