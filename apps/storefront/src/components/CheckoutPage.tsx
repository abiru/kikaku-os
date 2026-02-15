import { useStore } from '@nanostores/react';
import { useState, useEffect } from 'react';
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
	const [emailSubmitted, setEmailSubmitted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		createQuoteOnly();
	}, []);

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
			console.error('Checkout initialization error:', err);
			setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
			setLoading(false);
		}
	};

	const handleEmailSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!customerEmail || !customerEmail.includes('@') || !quoteId) return;

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
						email: customerEmail
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
			console.error('Payment intent error:', err);
			setError(err instanceof Error ? err.message : 'Failed to create payment');
			setLoading(false);
		}
	};

	const createQuote = async (couponCode?: string) => {
		setEmailSubmitted(false);
		setClientSecret(null);
		await createQuoteOnly(couponCode);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
					<p className="mt-4 text-gray-600">{t('checkout.loading')}</p>
				</div>
			</div>
		);
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
					<a href="/cart" className="mt-6 inline-block text-indigo-600 hover:text-indigo-700">
						{t('checkout.returnToCart')}
					</a>
				</div>
			</div>
		);
	}

	if (cartItems.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center">
					<p className="text-lg text-gray-900">{t('cart.empty')}</p>
					<a href="/products" className="mt-4 inline-block text-indigo-600 hover:text-indigo-700">
						{t('cart.continueShopping')}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">
				{t('checkout.title')}
			</h1>

			<CheckoutSteps currentStep={!breakdown ? 'cart' : !emailSubmitted ? 'email' : 'payment'} />

			{error && (
				<div className="mb-6 rounded-md bg-red-50 p-4">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column - Email + Checkout form */}
				<div className="lg:col-span-7">
					{!emailSubmitted ? (
						<form onSubmit={handleEmailSubmit} className="space-y-4">
							<div>
								<label htmlFor="email" className="block text-sm font-medium text-gray-700">
									{t('checkout.email') || 'Email'}
								</label>
								<input
									type="email"
									id="email"
									required
									value={customerEmail}
									onChange={(e) => setCustomerEmail(e.target.value)}
									placeholder={t('checkout.emailPlaceholder') || 'your@email.com'}
									className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border"
								/>
							</div>
							<button
								type="submit"
								disabled={loading || !customerEmail.includes('@')}
								className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
