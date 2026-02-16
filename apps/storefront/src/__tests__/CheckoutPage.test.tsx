import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({
		t: (key: string, params?: Record<string, string>) => {
			if (params) {
				return Object.entries(params).reduce(
					(acc, [k, v]) => acc.replace(`{${k}}`, v),
					key
				);
			}
			return key;
		},
	}),
	translations: {},
}));

vi.mock('../lib/format', () => ({
	formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
	formatDate: (dateStr: string | null) => dateStr || '-',
}));

vi.mock('@stripe/react-stripe-js', () => ({
	Elements: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="stripe-elements">{children}</div>
	),
	PaymentElement: () => <div data-testid="payment-element">PaymentElement</div>,
	AddressElement: () => <div data-testid="address-element">AddressElement</div>,
	ExpressCheckoutElement: () => (
		<div data-testid="express-checkout">ExpressCheckout</div>
	),
	useStripe: () => ({ confirmPayment: vi.fn() }),
	useElements: () => ({ getElement: vi.fn() }),
}));

vi.mock('@stripe/stripe-js', () => ({
	loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../lib/api', () => ({
	getApiBase: () => 'http://localhost:8787',
	fetchJson: vi.fn(),
}));

import CheckoutPage from '../components/CheckoutPage';
import { $cartItems, $appliedCoupon } from '../lib/cart';
import { fetchJson } from '../lib/api';

const mockFetchJson = fetchJson as ReturnType<typeof vi.fn>;

const mockQuoteResponse = {
	ok: true,
	quoteId: 'quote_123',
	breakdown: {
		subtotal: 2727,
		taxAmount: 273,
		cartTotal: 3000,
		discount: 0,
		shippingFee: 500,
		grandTotal: 3500,
		currency: 'JPY',
	},
	expiresAt: '2026-01-15T12:00:00Z',
};

const mockIntentResponse = {
	ok: true,
	clientSecret: 'pi_test_secret',
	orderId: 1,
	orderPublicToken: 'tok_pub_123',
	publishableKey: 'pk_test_xxx',
};

describe('CheckoutPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		$cartItems.set({});
		$appliedCoupon.set(null);
	});

	it('shows empty cart message when cart is empty', async () => {
		mockFetchJson.mockRejectedValueOnce(new Error('cart.empty'));

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(
				screen.getByText('cart.empty') || screen.getByText('cart.continueShopping')
			).toBeTruthy();
		});
	});

	it('shows loading skeleton initially', () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		// fetchJson never resolves to keep loading state
		mockFetchJson.mockReturnValue(new Promise(() => {}));

		render(<CheckoutPage />);

		const skeleton = document.querySelector('.animate-pulse');
		expect(skeleton).toBeInTheDocument();
	});

	it('shows email form after quote is created', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const emailInput = document.getElementById('checkout-page-email');
			expect(emailInput).toBeInTheDocument();
		});
	});

	it('displays checkout title after loading', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Title Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByText('checkout.title')).toBeInTheDocument();
		});
	});

	it('shows checkout steps navigation', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Steps Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const nav = screen.getByRole('navigation', { name: /checkout steps/i });
			expect(nav).toBeInTheDocument();
		});
	});

	it('validates email format', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Email Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const emailInput = document.getElementById('checkout-page-email');
			expect(emailInput).toBeInTheDocument();
		});

		const emailInput = document.getElementById('checkout-page-email')!;

		// Type invalid email and blur
		fireEvent.change(emailInput, { target: { value: 'invalid' } });
		fireEvent.blur(emailInput);

		await waitFor(() => {
			const errorElement = document.getElementById('checkout-email-error');
			expect(errorElement).toBeInTheDocument();
			expect(errorElement?.textContent).toBe('checkout.emailInvalid');
		});
	});

	it('shows required error when email is empty', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Required Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const emailInput = document.getElementById('checkout-page-email');
			expect(emailInput).toBeInTheDocument();
		});

		// Submit form with empty email
		const form = document.querySelector('form')!;
		fireEvent.submit(form);

		await waitFor(() => {
			const errorElement = document.getElementById('checkout-email-error');
			expect(errorElement).toBeInTheDocument();
			expect(errorElement?.textContent).toBe('checkout.emailRequired');
		});
	});

	it('shows error when quote creation fails', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Error Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockRejectedValueOnce(new Error('Network error'));

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByText('Network error')).toBeInTheDocument();
		});
	});

	it('shows retry button on error', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Retry Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockRejectedValueOnce(new Error('Failed'));

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByText('errors.retry')).toBeInTheDocument();
		});
	});

	it('shows return to cart link on error', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Return Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockRejectedValueOnce(new Error('Failed'));

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const returnLink = screen.getByText('checkout.returnToCart');
			expect(returnLink.closest('a')).toHaveAttribute('href', '/cart');
		});
	});

	it('email input has proper aria attributes', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'A11y Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const emailInput = document.getElementById('checkout-page-email');
			expect(emailInput).toBeInTheDocument();
			expect(emailInput).toHaveAttribute('aria-required', 'true');
			expect(emailInput).toHaveAttribute('type', 'email');
		});

		// Verify label is associated
		const label = document.querySelector('label[for="checkout-page-email"]');
		expect(label).toBeInTheDocument();
	});

	it('renders order summary with items', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Summary Product A',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
			'2': {
				variantId: 2,
				productId: 200,
				title: 'Summary Product B',
				variantTitle: 'Large',
				price: 5000,
				currency: 'JPY',
				quantity: 2,
				taxRate: 0.1,
			},
		});

		mockFetchJson.mockResolvedValueOnce(mockQuoteResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByText('checkout.orderSummary')).toBeInTheDocument();
			expect(screen.getByText('Summary Product A')).toBeInTheDocument();
			expect(screen.getByText('Summary Product B')).toBeInTheDocument();
		});
	});
});
