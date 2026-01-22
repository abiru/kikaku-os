import { useStore } from '@nanostores/react';
import { useState, useEffect } from 'react';
import {
	$cartArray,
	$appliedCoupon,
	type CartItem
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useTranslation } from '../i18n';
import CheckoutForm from './CheckoutForm';
import OrderSummary from './OrderSummary';

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
	publishableKey: string;
};

export default function CheckoutPage() {
	const { t } = useTranslation();
	const cartItems = useStore($cartArray);
	const appliedCoupon = useStore($appliedCoupon);

	const [quoteId, setQuoteId] = useState<string | null>(null);
	const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [orderId, setOrderId] = useState<number | null>(null);
	const [publishableKey, setPublishableKey] = useState<string>('');
	const [email, setEmail] = useState<string>('');
	const [emailSubmitted, setEmailSubmitted] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		initializeQuote();
	}, []);

	const initializeQuote = async (couponCode?: string) => {
		try {
			setLoading(true);
			setError(null);

			if (cartItems.length === 0) {
				setError(t('cart.empty'));
				setLoading(false);
				return;
			}

			// Create quote
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

			setQuoteId(quoteData.quoteId);
			setBreakdown(quoteData.breakdown);

			setLoading(false);
		} catch (err) {
			console.error('Checkout initialization error:', err);
			setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
			setLoading(false);
		}
	};

	const createQuote = async (couponCode?: string) => {
		await initializeQuote(couponCode);
	};

	const handleEmailSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!email.trim() || !quoteId) {
			return;
		}

		try {
			setLoading(true);
			setError(null);

			// Create payment intent with real email
			const intentData = await fetchJson<PaymentIntentResponse>(
				`${getApiBase()}/payments/intent`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						quoteId,
						email: email.trim()
					})
				}
			);

			if (!intentData.ok) {
				throw new Error('Failed to create payment intent');
			}

			setClientSecret(intentData.clientSecret);
			setOrderId(intentData.orderId);

			// Use publishable key from API or fall back to env variable
			const pubKey = intentData.publishableKey || import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
			if (!pubKey) {
				throw new Error('Stripe publishable key is not configured');
			}
			setPublishableKey(pubKey);
			setEmailSubmitted(true);
			setLoading(false);
		} catch (err) {
			console.error('Payment intent creation error:', err);
			setError(err instanceof Error ? err.message : 'Failed to create payment intent');
			setLoading(false);
		}
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

	// Show email collection form before creating payment intent
	if (!emailSubmitted && breakdown) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
				<h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">
					{t('checkout.title')}
				</h1>

				{error && (
					<div className="mb-6 rounded-md bg-red-50 p-4">
						<p className="text-sm text-red-800">{error}</p>
					</div>
				)}

				<div className="bg-white rounded-lg shadow-sm p-6">
					<h2 className="text-lg font-medium text-gray-900 mb-4">
						{t('checkout.enterEmail')}
					</h2>
					<form onSubmit={handleEmailSubmit} className="space-y-4">
						<div>
							<label htmlFor="checkout-email" className="block text-sm font-medium text-gray-700 mb-2">
								{t('checkout.email')}
							</label>
							<input
								type="email"
								id="checkout-email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border"
								placeholder="your@email.com"
							/>
							<p className="mt-2 text-sm text-gray-500">
								{t('checkout.emailHelp')}
							</p>
						</div>

						<button
							type="submit"
							disabled={!email.trim()}
							className="w-full rounded-md bg-indigo-600 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
						>
							{t('checkout.continue')}
						</button>
					</form>

					{breakdown && (
						<div className="mt-6 border-t border-gray-200 pt-6">
							<h3 className="text-sm font-medium text-gray-900 mb-4">{t('cart.orderSummary')}</h3>
							<dl className="space-y-3">
								<div className="flex justify-between text-sm">
									<dt className="text-gray-600">{t('cart.subtotal')}</dt>
									<dd className="text-gray-900">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: breakdown.currency }).format(breakdown.subtotal)}</dd>
								</div>
								<div className="flex justify-between text-sm">
									<dt className="text-gray-600">{t('cart.tax')}</dt>
									<dd className="text-gray-900">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: breakdown.currency }).format(breakdown.taxAmount)}</dd>
								</div>
								<div className="flex justify-between text-sm">
									<dt className="text-gray-600">{t('cart.shipping')}</dt>
									<dd className="text-gray-900">{breakdown.shippingFee === 0 ? t('common.free') : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: breakdown.currency }).format(breakdown.shippingFee)}</dd>
								</div>
								<div className="flex justify-between text-base font-medium border-t border-gray-200 pt-3">
									<dt>{t('cart.orderTotal')}</dt>
									<dd>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: breakdown.currency }).format(breakdown.grandTotal)}</dd>
								</div>
							</dl>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">
				{t('checkout.title')}
			</h1>

			{error && (
				<div className="mb-6 rounded-md bg-red-50 p-4">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column - Checkout form */}
				<div className="lg:col-span-7">
					<CheckoutForm
						clientSecret={clientSecret}
						orderId={orderId}
						publishableKey={publishableKey}
						initialEmail={email}
					/>
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
