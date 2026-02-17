import { useStore } from '@nanostores/react';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
	$cartArray,
	$appliedCoupon
} from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useTranslation } from '../i18n';
import CheckoutForm from './CheckoutForm';
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
	orderPublicToken: string;
	publishableKey: string;
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
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [orderToken, setOrderToken] = useState<string | null>(null);
	const [publishableKey, setPublishableKey] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Stable fingerprint of cart contents for dependency tracking
	const cartFingerprint = useMemo(
		() => cartItems.map(i => `${i.variantId}:${i.quantity}`).sort().join(','),
		[cartItems]
	);

	// Ref to access latest fingerprint inside async functions
	const cartFingerprintRef = useRef(cartFingerprint);
	cartFingerprintRef.current = cartFingerprint;

	// Ref to abort in-flight requests when cart changes
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		// Reset payment state when cart changes
		setClientSecret(null);
		setOrderToken(null);
		createQuoteAndIntent();

		return () => {
			// Abort in-flight requests on cleanup (cart change or unmount)
			abortControllerRef.current?.abort();
		};
	}, [cartFingerprint]);

	const createQuoteAndIntent = async (couponCode?: string) => {
		// Cancel any previous in-flight request
		abortControllerRef.current?.abort();
		const controller = new AbortController();
		abortControllerRef.current = controller;

		// Snapshot the fingerprint at call time for post-async verification
		const snapshotFingerprint = cartFingerprintRef.current;

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
					}),
					signal: controller.signal
				}
			);

			if (!quoteData.ok) {
				throw new Error('Failed to create quote');
			}

			// Verify cart hasn't changed during quote creation
			if (snapshotFingerprint !== cartFingerprintRef.current) {
				return;
			}

			setBreakdown(quoteData.breakdown);

			const intentData = await fetchJson<PaymentIntentResponse>(
				`${getApiBase()}/payments/intent`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						quoteId: quoteData.quoteId,
						email: 'customer@checkout.pending',
						paymentMethod: 'auto'
					}),
					signal: controller.signal
				}
			);

			if (!intentData.ok) {
				throw new Error('Failed to create payment intent');
			}

			if (!intentData.orderPublicToken) {
				throw new Error('Public order token is missing');
			}

			// Final verification: discard if cart changed during intent creation
			if (snapshotFingerprint !== cartFingerprintRef.current) {
				return;
			}

			setClientSecret(intentData.clientSecret);
			setOrderToken(intentData.orderPublicToken);

			const pubKey = intentData.publishableKey || import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
			if (!pubKey) {
				throw new Error('Stripe publishable key is not configured');
			}
			setPublishableKey(pubKey);
			setLoading(false);
		} catch (err) {
			// Ignore abort errors (cart changed, new request supersedes)
			if (err instanceof DOMException && err.name === 'AbortError') return;

			if (err instanceof TypeError && err.message.includes('fetch')) {
				setError(t('errors.networkError'));
			} else {
				setError(err instanceof Error ? err.message : t('errors.checkoutFailed'));
			}
			setLoading(false);
		}
	};

	const createQuote = async (couponCode?: string) => {
		setClientSecret(null);
		await createQuoteAndIntent(couponCode);
	};

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
								onClick={() => createQuoteAndIntent()}
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

			{error && (
				<div className="mb-6 rounded-md bg-red-50 p-4" role="alert">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column - Stripe prebuilt payment form */}
				<div className="lg:col-span-7">
					<CheckoutForm
						clientSecret={clientSecret}
						orderToken={orderToken}
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

export default function CheckoutPage() {
	return (
		<ErrorBoundary>
			<CheckoutPageContent />
		</ErrorBoundary>
	);
}
