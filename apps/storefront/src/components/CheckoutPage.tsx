import { useStore } from '@nanostores/react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
	$cartArray,
	$appliedCoupon
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useTranslation } from '../i18n';
import CheckoutForm from './CheckoutForm';
import CheckoutSteps from './CheckoutSteps';
import OrderSummary from './OrderSummary';
import { ErrorBoundary } from './ErrorBoundary';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type QuoteBreakdown = {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shippingFee: number;
	grandTotal: number;
	currency: string;
};

type QuoteResponse = {
	ok: boolean;
	quoteId: string;
	breakdown: QuoteBreakdown;
	expiresAt: string;
};

type PaymentIntentResponse = {
	ok: boolean;
	clientSecret: string;
	orderId: number;
	orderPublicToken: string;
	publishableKey: string;
};

type CheckoutStep = 'cart' | 'email' | 'payment';
type CheckoutPaymentMethod = 'card' | 'bank_transfer';

const computeStep = (breakdown: QuoteBreakdown | null, emailSubmitted: boolean): CheckoutStep => {
	if (!breakdown) return 'cart';
	if (!emailSubmitted) return 'email';
	return 'payment';
};

function CheckoutSkeleton() {
	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			{/* Title skeleton */}
			<div className="animate-pulse mb-8">
				<div className="h-8 bg-gray-200 rounded w-48" />
			</div>

			{/* Step indicator skeleton */}
			<div className="animate-pulse flex justify-center gap-4 mb-8">
				<div className="h-7 w-7 bg-gray-200 rounded-full" />
				<div className="h-px w-12 bg-gray-200 self-center" />
				<div className="h-7 w-7 bg-gray-200 rounded-full" />
				<div className="h-px w-12 bg-gray-200 self-center" />
				<div className="h-7 w-7 bg-gray-200 rounded-full" />
			</div>

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column skeleton */}
				<div className="lg:col-span-7 animate-pulse space-y-4">
					<div className="h-5 bg-gray-200 rounded w-32" />
					<div className="h-12 bg-gray-200 rounded" />
					<div className="h-12 bg-gray-200 rounded" />
				</div>

				{/* Right column skeleton */}
				<div className="mt-10 lg:mt-0 lg:col-span-5 animate-pulse">
					<div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
						<div className="h-5 bg-gray-200 rounded w-24" />
						<div className="h-4 bg-gray-200 rounded" />
						<div className="h-4 bg-gray-200 rounded w-3/4" />
						<div className="border-t border-gray-200 pt-4 space-y-2">
							<div className="h-4 bg-gray-200 rounded" />
							<div className="h-4 bg-gray-200 rounded" />
							<div className="h-6 bg-gray-200 rounded w-1/2 mt-4" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function CheckoutPageContent() {
	const { t } = useTranslation();
	const cartItems = useStore($cartArray);
	const appliedCoupon = useStore($appliedCoupon);

	const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
	const [quoteId, setQuoteId] = useState<string | null>(null);
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [orderToken, setOrderToken] = useState<string | null>(null);
	const [publishableKey, setPublishableKey] = useState<string>('');
	const [customerEmail, setCustomerEmail] = useState<string>('');
	const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('card');
	const [emailError, setEmailError] = useState<string | null>(null);
	const [emailTouched, setEmailTouched] = useState(false);
	const [emailSubmitted, setEmailSubmitted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const emailInputRef = useRef<HTMLInputElement>(null);

	// Fix 1: Stable fingerprint of cart contents for dependency tracking
	const cartFingerprint = useMemo(
		() => cartItems.map(i => `${i.variantId}:${i.quantity}`).sort().join(','),
		[cartItems]
	);

	useEffect(() => {
		// Reset payment state when cart changes
		setEmailSubmitted(false);
		setClientSecret(null);
		setOrderToken(null);
		createQuoteOnly();
	}, [cartFingerprint]);

	const createQuoteOnly = async (couponCode?: string) => {
		try {
			setLoading(true);
			setError(null);

			if (cartItems.length === 0) {
				setError(t('cart.empty'));
				setLoading(false);
				return;
			}

			const items = cartItems.map(item => ({
				variantId: item.variantId,
				quantity: item.quantity
			}));

			const quoteData = await fetchJson<QuoteResponse>(
				`${getApiBase()}/checkout/quote`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						items,
						couponCode: couponCode || appliedCoupon?.code || undefined
					})
				}
			);

			if (!quoteData.ok) {
				throw new Error('Failed to create quote');
			}

			setBreakdown(quoteData.breakdown);
			setQuoteId(quoteData.quoteId);
			setLoading(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
			setLoading(false);
		}
	};

	const validateEmail = useCallback((email: string): string | null => {
		if (!email) return t('checkout.emailRequired');
		if (!EMAIL_REGEX.test(email)) return t('checkout.emailInvalid');
		return null;
	}, [t]);

	const handleEmailBlur = useCallback(() => {
		setEmailTouched(true);
		setEmailError(validateEmail(customerEmail));
	}, [customerEmail, validateEmail]);

	const handleEmailChange = useCallback((value: string) => {
		setCustomerEmail(value);
		// Real-time validation: validate whenever value is non-empty
		if (value.length > 0) {
			setEmailError(validateEmail(value));
			setEmailTouched(true);
		} else if (emailTouched) {
			setEmailError(validateEmail(value));
		}
	}, [emailTouched, validateEmail]);

	const handleEmailSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const validationError = validateEmail(customerEmail);
		if (validationError) {
			setEmailTouched(true);
			setEmailError(validationError);
			emailInputRef.current?.focus();
			return;
		}
		if (!quoteId) return;

		try {
			setLoading(true);
			setError(null);

			const intentData = await fetchJson<PaymentIntentResponse>(
				`${getApiBase()}/payments/intent`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							quoteId,
							email: customerEmail,
							paymentMethod
						})
					}
				);

			if (!intentData.ok) {
				throw new Error('Failed to create payment intent');
			}

			if (!intentData.orderPublicToken) {
				throw new Error('Public order token is missing');
			}

			setClientSecret(intentData.clientSecret);
			setOrderToken(intentData.orderPublicToken);

			const pubKey = intentData.publishableKey || import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
			if (!pubKey) {
				throw new Error('Stripe publishable key is not configured');
			}
			setPublishableKey(pubKey);
			setEmailSubmitted(true);
			setLoading(false);
		} catch (err) {
			if (err instanceof TypeError && err.message.includes('fetch')) {
				setError(t('errors.networkError'));
			} else {
				setError(err instanceof Error ? err.message : t('errors.checkoutFailed'));
			}
			setLoading(false);
		}
	};

	const handleGoBack = () => {
		if (emailSubmitted) {
			setEmailSubmitted(false);
			setClientSecret(null);
			setOrderToken(null);
		}
	};

	const createQuote = async (couponCode?: string) => {
		setEmailSubmitted(false);
		setClientSecret(null);
		await createQuoteOnly(couponCode);
	};

	const currentStep = computeStep(breakdown, emailSubmitted);
	const canGoBack = emailSubmitted;

	if (loading) {
		return <CheckoutSkeleton />;
	}

	if (error && !breakdown) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center max-w-md">
					<div className="text-red-600 mb-4">
						<svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<p className="text-lg text-gray-900 font-medium">{error}</p>
					<div className="mt-6 flex flex-col items-center gap-3">
						<button
							type="button"
							onClick={() => createQuoteOnly()}
							className="text-brand hover:text-brand-active font-medium min-h-[44px] flex items-center justify-center"
						>
							{t('errors.retry')}
						</button>
						<a href="/cart" className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] flex items-center justify-center">
							{t('checkout.returnToCart')}
						</a>
					</div>
				</div>
			</div>
		);
	}

	if (cartItems.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center">
					<p className="text-lg text-gray-900">{t('cart.empty')}</p>
					<a href="/products" className="mt-4 inline-block text-brand hover:text-brand-active min-h-[44px] flex items-center justify-center">
						{t('cart.continueShopping')}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-8">
				{t('checkout.title')}
			</h1>

			<CheckoutSteps currentStep={currentStep} />

			{/* Back button */}
			{canGoBack && (
				<div className="mb-6">
					<button
						type="button"
						onClick={handleGoBack}
						className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-active min-h-[44px] touch-manipulation"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
						</svg>
						{t('checkout.goBack')}
					</button>
				</div>
			)}

			{error && (
				<div className="mb-6 rounded-md bg-red-50 p-4" role="alert">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column - Email + Checkout form */}
				<div className="lg:col-span-7">
					{!emailSubmitted ? (
						<form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
							<div>
								<label htmlFor="checkout-page-email" className="block text-sm font-medium text-gray-700">
									{t('checkout.email') || 'Email'} <span className="text-red-500">*</span>
								</label>
								<input
									ref={emailInputRef}
									type="email"
									id="checkout-page-email"
									required
									aria-required="true"
									aria-invalid={emailTouched && !!emailError}
									aria-describedby={emailTouched && emailError ? 'checkout-email-error' : undefined}
									value={customerEmail}
									onChange={(e) => handleEmailChange(e.target.value)}
									onBlur={handleEmailBlur}
									placeholder={t('checkout.emailPlaceholder') || 'your@email.com'}
									className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand focus:ring-brand text-base p-3 border"
								/>
									{emailTouched && emailError && (
										<p id="checkout-email-error" className="text-red-500 text-sm mt-1" role="alert">{emailError}</p>
									)}
								</div>
								<fieldset>
									<legend className="block text-sm font-medium text-gray-700">
										{t('checkout.paymentMethodLabel') || 'Payment Method'}
									</legend>
									<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
										<label className="flex items-center gap-2 rounded-md border border-gray-300 p-3 cursor-pointer hover:border-brand">
											<input
												type="radio"
												name="payment-method"
												value="card"
												checked={paymentMethod === 'card'}
												onChange={() => setPaymentMethod('card')}
												className="h-4 w-4 text-brand focus:ring-brand"
											/>
											<span className="text-sm text-gray-900">{t('checkout.paymentMethodCard') || 'Card Payment'}</span>
										</label>
										<label className="flex items-center gap-2 rounded-md border border-gray-300 p-3 cursor-pointer hover:border-brand">
											<input
												type="radio"
												name="payment-method"
												value="bank_transfer"
												checked={paymentMethod === 'bank_transfer'}
												onChange={() => setPaymentMethod('bank_transfer')}
												className="h-4 w-4 text-brand focus:ring-brand"
											/>
											<span className="text-sm text-gray-900">{t('checkout.paymentMethodBankTransfer') || 'Bank Transfer'}</span>
										</label>
									</div>
								</fieldset>
								<button
								type="submit"
								disabled={loading || !customerEmail.includes('@')}
								className="w-full bg-brand text-white py-3 px-4 rounded-md hover:bg-brand-active disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] text-base font-medium touch-manipulation"
							>
								{loading ? (t('checkout.loading') || 'Loading...') : (t('checkout.proceedToPayment') || 'Proceed to Payment')}
							</button>
						</form>
					) : (
						<CheckoutForm
							clientSecret={clientSecret}
							orderToken={orderToken}
							publishableKey={publishableKey}
						/>
					)}
				</div>

				{/* Right column - Order summary */}
				<div className="mt-10 lg:mt-0 lg:col-span-5">
					<OrderSummary
						items={cartItems}
						breakdown={breakdown}
						onCouponApply={createQuote}
					/>
				</div>
			</div>
		</div>
	);
}

export default function CheckoutPage() {
	return (
		<ErrorBoundary>
			<CheckoutPageContent />
		</ErrorBoundary>
	);
}
