import { useStore } from '@nanostores/react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { $cartArray, $appliedCoupon } from '../lib/cart';
import { getApiBase, fetchJson } from '../lib/api';
import { useTranslation } from '../i18n';

export type QuoteBreakdown = {
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

export type UseCheckoutReturn = {
	cartItems: ReturnType<typeof $cartArray.get>;
	breakdown: QuoteBreakdown | null;
	clientSecret: string | null;
	orderToken: string | null;
	publishableKey: string;
	loading: boolean;
	error: string | null;
	retry: () => void;
	createQuote: (couponCode?: string) => Promise<void>;
};

export function useCheckout(): UseCheckoutReturn {
	const { t } = useTranslation();
	const cartItems = useStore($cartArray);
	const appliedCoupon = useStore($appliedCoupon);

	const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [orderToken, setOrderToken] = useState<string | null>(null);
	const [publishableKey, setPublishableKey] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const cartFingerprint = useMemo(
		() => cartItems.map(i => `${i.variantId}:${i.quantity}`).sort().join(','),
		[cartItems]
	);

	// Ref to access latest fingerprint inside async functions
	const cartFingerprintRef = useRef(cartFingerprint);
	cartFingerprintRef.current = cartFingerprint;

	// Ref to abort in-flight requests when cart changes
	const abortControllerRef = useRef<AbortController | null>(null);

	const createQuoteAndIntent = useCallback(async (couponCode?: string) => {
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
	}, [cartItems, appliedCoupon, t]);

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

	const createQuote = useCallback(async (couponCode?: string) => {
		setClientSecret(null);
		await createQuoteAndIntent(couponCode);
	}, [createQuoteAndIntent]);

	const retry = useCallback(() => {
		createQuoteAndIntent();
	}, [createQuoteAndIntent]);

	return {
		cartItems,
		breakdown,
		clientSecret,
		orderToken,
		publishableKey,
		loading,
		error,
		retry,
		createQuote,
	};
}
