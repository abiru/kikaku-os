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
			/>
		);

		expect(screen.getByText('checkout.paymentDetails')).toBeInTheDocument();
	});
});
