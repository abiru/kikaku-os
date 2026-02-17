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
		// Desktop summary + mobile sticky bar both render checkout button
		expect(screen.getAllByText('cart.checkout').length).toBeGreaterThanOrEqual(1);
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

		// Both desktop and mobile checkout buttons should be disabled
		const checkoutButtons = screen.getAllByText('cart.checkout');
		for (const btn of checkoutButtons) {
			expect(btn).toBeDisabled();
		}
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
			const checkoutButtons = screen.getAllByText('cart.checkout');
			for (const btn of checkoutButtons) {
				expect(btn).not.toBeDisabled();
			}
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
			expect(screen.getAllByText('cart.checkout').length).toBeGreaterThanOrEqual(1);
		});

		// fetch should only be called once for the shipping config
		const shippingFetches = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
			(call) => String(call[0]).includes('/checkout/config')
		);
		expect(shippingFetches).toHaveLength(1);
	});
});

describe('Cart edge cases', () => {
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

	it('handles empty cart gracefully', () => {
		$cartItems.set({});

		render(<Cart />);

		expect(screen.getByText('cart.empty')).toBeInTheDocument();
		expect(screen.getByText('cart.emptyDescription')).toBeInTheDocument();
		expect(screen.queryByText('cart.orderSummary')).not.toBeInTheDocument();
	});

	it('handles item with zero price', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Free Sample',
				variantTitle: 'Default',
				price: 0,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('Free Sample')).toBeInTheDocument();
		expect(screen.getByText('cart.orderSummary')).toBeInTheDocument();
	});

	it('handles item with very large quantity', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Bulk Product',
				variantTitle: 'Default',
				price: 100,
				currency: 'JPY',
				quantity: 99,
				taxRate: 0.10,
			},
		});

		render(<Cart />);

		expect(screen.getByText('Bulk Product')).toBeInTheDocument();
		const select = screen.getByRole('combobox');
		expect(select).toHaveValue('99');
	});

	it('handles item with stock of 1', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Last One Product',
				variantTitle: 'Default',
				price: 5000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.10,
				stock: 1,
			},
		});

		render(<Cart />);

		const select = screen.getByRole('combobox');
		const options = select.querySelectorAll('option');
		expect(options).toHaveLength(1);
		expect(options[0]).toHaveValue('1');
	});

	it('handles item without taxRate (uses default 10%)', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'No Tax Rate Product',
				variantTitle: 'Default',
				price: 1100,
				currency: 'JPY',
				quantity: 1,
			},
		});

		render(<Cart />);

		expect(screen.getByText('No Tax Rate Product')).toBeInTheDocument();
		expect(screen.getByText('cart.tax')).toBeInTheDocument();
	});
});

describe('Cart accessibility', () => {
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

	it('has accessible remove button with sr-only text', () => {
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

		// The remove button has accessible text
		const removeButton = screen.getByText('common.remove');
		expect(removeButton).toBeInTheDocument();
		expect(removeButton.tagName).toBe('BUTTON');
	});

	it('has aria-live region for cart updates', () => {
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

		const { container } = render(<Cart />);

		const liveRegion = container.querySelector('[aria-live="polite"]');
		expect(liveRegion).toBeInTheDocument();
	});

	it('has accessible cart section with aria-labelledby', () => {
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

		const { container } = render(<Cart />);

		const section = container.querySelector('section[aria-labelledby="cart-heading"]');
		expect(section).toBeInTheDocument();
		const heading = container.querySelector('#cart-heading');
		expect(heading).toBeInTheDocument();
	});

	it('has aria-label on quantity selector', () => {
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

		const select = screen.getByRole('combobox');
		expect(select).toHaveAttribute('aria-label');
	});

	it('has aria-hidden on decorative SVG icons', () => {
		$cartItems.set({});

		const { container } = render(<Cart />);

		// The empty cart icon SVG has aria-hidden="true"
		const decorativeSvg = container.querySelector('svg[aria-hidden="true"]');
		expect(decorativeSvg).toBeInTheDocument();
	});

	it('renders items list with role="list"', () => {
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

		const list = screen.getByRole('list');
		expect(list).toBeInTheDocument();
	});
});
