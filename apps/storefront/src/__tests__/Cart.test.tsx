import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock i18n — return the key so tests are language-independent
vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

import Cart from '../components/Cart';
import { $cartItems, $appliedCoupon, $shippingConfig } from '../lib/cart';

// Mock fetch for shipping config
global.fetch = vi.fn(() =>
	Promise.resolve({
		ok: true,
		text: () => Promise.resolve(JSON.stringify({ shippingFee: 500, freeShippingThreshold: 5000 })),
	})
) as unknown as typeof fetch;

describe('Cart', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		$cartItems.set({});
		$appliedCoupon.set(null);
		$shippingConfig.set({ shippingFee: 500, freeShippingThreshold: 5000 });
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
			Promise.resolve({
				ok: true,
				text: () => Promise.resolve(JSON.stringify({ shippingFee: 500, freeShippingThreshold: 5000 })),
			})
		);
	});

	it('renders empty cart when no items', () => {
		render(<Cart />);

		expect(screen.getByText('cart.empty')).toBeInTheDocument();
		expect(screen.getByText('cart.emptyDescription')).toBeInTheDocument();
	});

	it('shows browse products link in empty cart', () => {
		render(<Cart />);

		const link = screen.getByText('cart.browseProducts');
		expect(link).toBeInTheDocument();
		expect(link.closest('a')).toHaveAttribute('href', '/products');
	});

	it('renders cart items when items exist', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Large',
				price: 3000,
				currency: 'JPY',
				quantity: 2,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('Test Product')).toBeInTheDocument();
		expect(screen.getByText('Large')).toBeInTheDocument();
	});

	it('renders multiple cart items', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Product A',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
			'2': {
				variantId: 2,
				productId: 200,
				title: 'Product B',
				variantTitle: 'Default',
				price: 2000,
				currency: 'JPY',
				quantity: 3,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('Product A')).toBeInTheDocument();
		expect(screen.getByText('Product B')).toBeInTheDocument();
	});

	it('does not show variant title when it is Default', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Simple Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('Simple Product')).toBeInTheDocument();
		expect(screen.queryByText('Default')).not.toBeInTheDocument();
	});

	it('renders order summary section with cart items', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('cart.orderSummary')).toBeInTheDocument();
		expect(screen.getByText('cart.subtotal')).toBeInTheDocument();
		expect(screen.getByText('cart.tax')).toBeInTheDocument();
		expect(screen.getByText('cart.checkout')).toBeInTheDocument();
	});

	it('renders remove button for each item', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('common.remove')).toBeInTheDocument();
	});

	it('renders quantity selector for each item', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 2,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		const select = screen.getByRole('combobox');
		expect(select).toBeInTheDocument();
		expect(select).toHaveValue('2');
	});

	it('renders product link for each item', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 42,
				title: 'Linked Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		const link = screen.getByText('Linked Product').closest('a');
		expect(link).toHaveAttribute('href', '/products/42');
	});

	it('limits quantity options when stock is defined', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Limited Stock Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
				stock: 3,
			},
		});

		render(<Cart />);

		const select = screen.getByRole('combobox');
		const options = select.querySelectorAll('option');
		expect(options).toHaveLength(3);
		expect(options[0]).toHaveValue('1');
		expect(options[2]).toHaveValue('3');
	});

	it('shows shipping error and retry button when fetch fails', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: () => Promise.resolve('Server error'),
			})
		);

		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		await waitFor(() => {
			expect(screen.getByText('cart.shippingConfigError')).toBeInTheDocument();
		});
		expect(screen.getByText('cart.retry')).toBeInTheDocument();
	});

	it('disables checkout button when shipping config fetch fails', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: () => Promise.resolve('Server error'),
			})
		);

		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		await waitFor(() => {
			expect(screen.getByText('cart.shippingConfigError')).toBeInTheDocument();
		});

		const checkoutButton = screen.getByText('cart.checkout');
		expect(checkoutButton).toBeDisabled();
		expect(screen.getByText('cart.checkoutBlockedByShipping')).toBeInTheDocument();
	});

	it('enables checkout button when shipping config loads successfully', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		await waitFor(() => {
			const checkoutButton = screen.getByText('cart.checkout');
			expect(checkoutButton).not.toBeDisabled();
		});
	});

	it('does not make duplicate concurrent shipping config fetches', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 1000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		await waitFor(() => {
			expect(screen.getByText('cart.checkout')).toBeInTheDocument();
		});

		// fetch should only be called once for the shipping config
		const shippingFetches = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
			(call) => String(call[0]).includes('/checkout/config')
		);
		expect(shippingFetches).toHaveLength(1);
	});
});
