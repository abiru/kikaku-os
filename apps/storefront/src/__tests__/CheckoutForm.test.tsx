import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock i18n — return the key so tests are language-independent
vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

// Mock Stripe
vi.mock('@stripe/react-stripe-js', () => ({
	Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements">{children}</div>,
	PaymentElement: () => <div data-testid="payment-element">PaymentElement</div>,
	AddressElement: () => <div data-testid="address-element">AddressElement</div>,
	useStripe: () => ({
		confirmPayment: vi.fn(),
	}),
	useElements: () => ({
		submit: vi.fn().mockResolvedValue({}),
		getElement: vi.fn(),
	}),
}));

vi.mock('@stripe/stripe-js', () => ({
	loadStripe: vi.fn(() => Promise.resolve({})),
}));

import CheckoutForm from '../components/CheckoutForm';

const defaultProps = {
	items: [{ productId: 1, variantId: 1, title: 'Test Product', variantTitle: 'Default', price: 1000, currency: 'JPY', quantity: 1 }],
	breakdown: { subtotal: 1000, taxAmount: 100, cartTotal: 1000, discount: 0, shippingFee: 500, grandTotal: 1600, currency: 'JPY' },
};

describe('CheckoutForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders loading skeleton when clientSecret is null', () => {
		render(
			<CheckoutForm
				clientSecret={null}
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		const container = document.querySelector('.animate-pulse');
		expect(container).toBeInTheDocument();
		expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
	});

	it('renders loading skeleton when publishableKey is empty', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey=""
				{...defaultProps}
			/>
		);

		const container = document.querySelector('.animate-pulse');
		expect(container).toBeInTheDocument();
	});

	it('renders Stripe Elements when clientSecret and publishableKey are provided', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		expect(screen.getByTestId('stripe-elements')).toBeInTheDocument();
		expect(screen.getByTestId('payment-element')).toBeInTheDocument();
		expect(screen.getByTestId('address-element')).toBeInTheDocument();
	});

	it('renders email input field', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		const emailInput = screen.getByPlaceholderText('your@email.com');
		expect(emailInput).toBeInTheDocument();
		expect(emailInput).toHaveAttribute('type', 'email');
		expect(emailInput).toBeRequired();
	});

	it('renders submit button', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		const submitButton = screen.getByRole('button', { name: /checkout\.payNow/i });
		expect(submitButton).toBeInTheDocument();
		expect(submitButton).toHaveAttribute('type', 'submit');
	});

	it('renders checkout title heading', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		expect(screen.getByText('checkout.title')).toBeInTheDocument();
	});

	it('renders payment details label', () => {
		render(
			<CheckoutForm
				clientSecret="pi_secret_123"
				orderToken="tok_123"
				publishableKey="pk_test_xxx"
				{...defaultProps}
			/>
		);

		expect(screen.getByText('checkout.paymentDetails')).toBeInTheDocument();
	});
});
