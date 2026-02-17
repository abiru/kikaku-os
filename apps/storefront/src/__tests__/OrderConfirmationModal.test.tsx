import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	translations: {},
}));

vi.mock('../lib/format', () => ({
	formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}));

import OrderConfirmationModal from '../components/OrderConfirmationModal';

const mockItems = [
	{
		variantId: 1,
		productId: 100,
		title: 'Test Product',
		variantTitle: 'Default',
		price: 3000,
		currency: 'JPY',
		quantity: 1,
		taxRate: 0.1,
	},
	{
		variantId: 2,
		productId: 200,
		title: 'Another Product',
		variantTitle: 'Large',
		price: 5000,
		currency: 'JPY',
		quantity: 2,
		taxRate: 0.1,
	},
];

const mockBreakdown = {
	subtotal: 11818,
	taxAmount: 1182,
	cartTotal: 13000,
	discount: 0,
	shippingFee: 500,
	grandTotal: 13500,
	currency: 'JPY',
};

const mockAddress = {
	name: '山田太郎',
	address: {
		line1: '千代田1-1-1',
		line2: null,
		city: '千代田区',
		state: '東京都',
		postal_code: '100-0001',
		country: 'JP',
	},
};

describe('OrderConfirmationModal', () => {
	it('renders order items', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('Test Product')).toBeInTheDocument();
		expect(screen.getByText('Another Product')).toBeInTheDocument();
	});

	it('renders price breakdown', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('checkout.subtotal')).toBeInTheDocument();
		expect(screen.getByText('checkout.tax')).toBeInTheDocument();
		expect(screen.getByText('checkout.shipping')).toBeInTheDocument();
		expect(screen.getByText('checkout.total')).toBeInTheDocument();
		expect(screen.getByText('JPY 13500')).toBeInTheDocument();
	});

	it('renders shipping address', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('山田太郎')).toBeInTheDocument();
		expect(screen.getByText('〒100-0001')).toBeInTheDocument();
		expect(screen.getByText('東京都千代田区千代田1-1-1')).toBeInTheDocument();
	});

	it('renders email', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('test@example.com')).toBeInTheDocument();
	});

	it('renders confirm and cancel buttons', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('checkout.confirmAndPay')).toBeInTheDocument();
		expect(screen.getByText('checkout.goBack')).toBeInTheDocument();
	});

	it('calls onConfirm when confirm button is clicked', () => {
		const onConfirm = vi.fn();
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={onConfirm}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		fireEvent.click(screen.getByText('checkout.confirmAndPay'));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('calls onCancel when go back button is clicked', () => {
		const onCancel = vi.fn();
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={onCancel}
				isProcessing={false}
			/>
		);

		fireEvent.click(screen.getByText('checkout.goBack'));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('disables buttons when processing', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={true}
			/>
		);

		const confirmButton = screen.getByText('checkout.processing').closest('button');
		const cancelButton = screen.getByText('checkout.goBack').closest('button');
		expect(confirmButton).toBeDisabled();
		expect(cancelButton).toBeDisabled();
	});

	it('shows discount when present', () => {
		const breakdownWithDiscount = {
			...mockBreakdown,
			discount: 1000,
		};

		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={breakdownWithDiscount}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		expect(screen.getByText('checkout.discount')).toBeInTheDocument();
	});

	it('renders dialog with correct accessibility attributes', () => {
		render(
			<OrderConfirmationModal
				items={mockItems}
				breakdown={mockBreakdown}
				email="test@example.com"
				address={mockAddress}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
				isProcessing={false}
			/>
		);

		const dialog = screen.getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
	});
});
