import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

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
	AddressElement: () => <div data-testid="address-element">AddressElement</div>,
	PaymentElement: () => <div data-testid="payment-element">PaymentElement</div>,
	useStripe: () => ({ confirmPayment: vi.fn() }),
	useElements: () => ({ submit: vi.fn().mockResolvedValue({}), getElement: vi.fn() }),
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

	it('shows Stripe prebuilt payment form after quote/intent is created', async () => {
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

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByRole('heading', { level: 1, name: 'checkout.title' })).toBeInTheDocument();
			expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
			expect(screen.getByTestId('address-element')).toBeInTheDocument();
			expect(screen.getByTestId('payment-element')).toBeInTheDocument();
			expect(document.getElementById('checkout-email')).toBeInTheDocument();
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

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(screen.getByRole('heading', { level: 1, name: 'checkout.title' })).toBeInTheDocument();
		});
	});

	it('does not render wizard step navigation', async () => {
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

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			const nav = screen.queryByRole('navigation', { name: /checkout steps/i });
			expect(nav).not.toBeInTheDocument();
		});
	});

	it('calls quote and intent APIs in order', async () => {
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

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(mockFetchJson).toHaveBeenCalledTimes(2);
			expect(mockFetchJson.mock.calls[0]?.[0]).toContain('/checkout/quote');
			expect(mockFetchJson.mock.calls[1]?.[0]).toContain('/payments/intent');
		});
	});

	it('shows error when quote creation fails', async () => {
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

	it('passes AbortController signal to fetch calls', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Signal Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		await waitFor(() => {
			expect(mockFetchJson).toHaveBeenCalledTimes(2);
			// Both calls should include an AbortSignal
			const quoteCallOptions = mockFetchJson.mock.calls[0]?.[1];
			const intentCallOptions = mockFetchJson.mock.calls[1]?.[1];
			expect(quoteCallOptions?.signal).toBeInstanceOf(AbortSignal);
			expect(intentCallOptions?.signal).toBeInstanceOf(AbortSignal);
		});
	});

	it('ignores AbortError when cart changes during fetch', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Abort Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		// First call rejects with AbortError (simulating cart change during fetch)
		mockFetchJson.mockRejectedValueOnce(
			new DOMException('The operation was aborted.', 'AbortError')
		);

		// Second round (after cart change) succeeds
		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		// Change cart to trigger re-creation
		await act(async () => {
			$cartItems.set({
				'1': {
					variantId: 1,
					productId: 100,
					title: 'Abort Test Product',
					variantTitle: 'Default',
					price: 3000,
					currency: 'JPY',
					quantity: 2,
					taxRate: 0.1,
				},
			});
		});

		// Should eventually show the checkout form (not an error state)
		await waitFor(() => {
			expect(screen.getByRole('heading', { level: 1, name: 'checkout.title' })).toBeInTheDocument();
			expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
		});
	});

	it('resets clientSecret and orderToken when cart changes', async () => {
		$cartItems.set({
			'1': {
				variantId: 1,
				productId: 100,
				title: 'Reset Test Product',
				variantTitle: 'Default',
				price: 3000,
				currency: 'JPY',
				quantity: 1,
				taxRate: 0.1,
			},
		});

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

		await act(async () => {
			render(<CheckoutPage />);
		});

		// Wait for initial load
		await waitFor(() => {
			expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
		});

		// Now change cart - should trigger re-creation with loading state
		mockFetchJson.mockReturnValue(new Promise(() => {})); // Never resolves

		await act(async () => {
			$cartItems.set({
				'1': {
					variantId: 1,
					productId: 100,
					title: 'Reset Test Product',
					variantTitle: 'Default',
					price: 3000,
					currency: 'JPY',
					quantity: 3,
					taxRate: 0.1,
				},
			});
		});

		// Should show loading skeleton while new quote is being created
		await waitFor(() => {
			const skeleton = document.querySelector('.animate-pulse');
			expect(skeleton).toBeInTheDocument();
		});
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

		mockFetchJson
			.mockResolvedValueOnce(mockQuoteResponse)
			.mockResolvedValueOnce(mockIntentResponse);

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
