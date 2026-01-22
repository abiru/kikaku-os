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
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		initializeCheckout();
	}, []);

	const initializeCheckout = async (couponCode?: string) => {
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

			// Automatically create payment intent with placeholder email
			const intentData = await fetchJson<PaymentIntentResponse>(
				`${getApiBase()}/payments/intent`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						quoteId: quoteData.quoteId,
						email: 'customer@checkout.pending'
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

			setLoading(false);
		} catch (err) {
			console.error('Checkout initialization error:', err);
			setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
			setLoading(false);
		}
	};

	const createQuote = async (couponCode?: string) => {
		await initializeCheckout(couponCode);
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
