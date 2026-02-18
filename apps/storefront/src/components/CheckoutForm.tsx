import { useState, useEffect, useCallback, useRef } from 'react';
import { Elements, PaymentElement, AddressElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { useTranslation } from '../i18n';
import OrderConfirmationModal, { type AddressData } from './OrderConfirmationModal';
import type { CartItem } from '../lib/cart';
import { getApiBase } from '../lib/api';

// Singleton cache: loadStripe should only be called once per publishable key
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
	const cached = stripePromiseCache.get(publishableKey);
	if (cached) return cached;
	const promise = loadStripe(publishableKey);
	stripePromiseCache.set(publishableKey, promise);
	return promise;
}

const getStripeErrorMessage = (error: { type?: string; code?: string; decline_code?: string; message?: string }, t: (key: string) => string): string => {
	if (error.decline_code) {
		const key = `checkout.stripeErrors.${error.decline_code}`;
		const translated = t(key);
		if (translated !== key) return translated;
	}
	if (error.code) {
		const key = `checkout.stripeErrors.${error.code}`;
		const translated = t(key);
		if (translated !== key) return translated;
	}
	return t('checkout.stripeErrors.default');
};

const PAYMENT_TIMEOUT_MS = 30_000;
const STATUS_POLL_INTERVAL_MS = 3_000;
const STATUS_POLL_MAX_ATTEMPTS = 20;

type QuoteBreakdown = {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shippingFee: number;
	grandTotal: number;
	currency: string;
};

type CheckoutFormProps = {
	clientSecret: string | null;
	orderToken: string | null;
	publishableKey: string;
	items: CartItem[];
	breakdown: QuoteBreakdown | null;
};

type CheckoutFormInnerProps = {
	orderToken: string | null;
	items: CartItem[];
	breakdown: QuoteBreakdown | null;
};

type TimeoutState = {
	active: boolean;
	checking: boolean;
	confirmed: boolean;
};

function CheckoutFormInner({ orderToken, items, breakdown }: CheckoutFormInnerProps) {
	const { t } = useTranslation();
	const stripe = useStripe();
	const elements = useElements();
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [paymentElementReady, setPaymentElementReady] = useState(false);
	const [email, setEmail] = useState('');
	const [emailError, setEmailError] = useState<string | null>(null);
	const [showConfirmation, setShowConfirmation] = useState(false);
	const [addressData, setAddressData] = useState<AddressData | null>(null);
	const [timeoutState, setTimeoutState] = useState<TimeoutState>({
		active: false,
		checking: false,
		confirmed: false,
	});
	const formRef = useRef<HTMLFormElement>(null);
	const pollAbortRef = useRef<AbortController | null>(null);

	const pollPaymentStatus = useCallback(async (token: string) => {
		// Cancel any existing poll before starting a new one
		if (pollAbortRef.current) {
			pollAbortRef.current.abort();
		}
		const controller = new AbortController();
		pollAbortRef.current = controller;

		setTimeoutState(prev => ({ ...prev, active: true, checking: true, confirmed: false }));

		const base = getApiBase();
		let attempts = 0;

		while (attempts < STATUS_POLL_MAX_ATTEMPTS && !controller.signal.aborted) {
			try {
				const encoded = encodeURIComponent(token);
				const res = await fetch(`${base}/store/orders/${encoded}?poll=true`, {
					signal: controller.signal,
				});

				if (res.ok) {
					setTimeoutState(prev => ({ ...prev, checking: false, confirmed: true }));
					setTimeout(() => {
						window.location.href = `/checkout/success?order_id=${encodeURIComponent(token)}`;
					}, 1500);
					return;
				}

				if (res.status !== 202) {
					break;
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				// Handle network errors gracefully - continue polling
				console.error('Poll request failed:', err);
			}

			attempts += 1;
			await new Promise(resolve => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
		}

		if (!controller.signal.aborted) {
			setTimeoutState(prev => ({ ...prev, checking: false, confirmed: false }));
		}
	}, []);

	useEffect(() => {
		return () => {
			pollAbortRef.current?.abort();
		};
	}, []);

	const validateEmail = (value: string) => {
		if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
			setEmailError(t('checkout.emailInvalid'));
		} else {
			setEmailError(null);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!stripe || !elements || !orderToken || !paymentElementReady) {
			setErrorMessage(t('checkout.stripeLoadFailedDescription'));
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			const submitResult = await elements.submit();
			if (submitResult.error) {
				setErrorMessage(getStripeErrorMessage(submitResult.error, t));
				setIsProcessing(false);
				return;
			}

			// Show confirmation modal instead of immediately processing payment
			setIsProcessing(false);
			setShowConfirmation(true);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : t('checkout.stripeErrors.default'));
			setIsProcessing(false);
		}
	};

	const handleConfirmPayment = async () => {
		if (!stripe || !elements || !orderToken) return;

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			const confirmPromise = stripe.confirmPayment({
				elements,
				confirmParams: {
					return_url: `${window.location.origin}/checkout/success?order_id=${orderToken}`,
					...(email ? { receipt_email: email } : {})
				}
			});

			const timeoutPromise = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('PAYMENT_TIMEOUT')), PAYMENT_TIMEOUT_MS)
			);

			const { error } = await Promise.race([confirmPromise, timeoutPromise]);

			if (error) {
				setErrorMessage(getStripeErrorMessage(error, t));
				setIsProcessing(false);
				setShowConfirmation(false);
			}
			// If successful, user will be redirected by Stripe
		} catch (err) {
			if (err instanceof Error && err.message === 'PAYMENT_TIMEOUT') {
				if (orderToken) {
					pollPaymentStatus(orderToken);
				} else {
					setErrorMessage(t('checkout.paymentTimeout'));
					setIsProcessing(false);
				}
			} else {
				setErrorMessage(err instanceof Error ? err.message : t('checkout.stripeErrors.default'));
				setIsProcessing(false);
			}
			setShowConfirmation(false);
		}
	};

	return (
		<>
			{showConfirmation && breakdown && (
				<OrderConfirmationModal
					items={items}
					breakdown={breakdown}
					email={email}
					address={addressData}
					onConfirm={handleConfirmPayment}
					onCancel={() => setShowConfirmation(false)}
					isProcessing={isProcessing}
				/>
			)}

			<form ref={formRef} onSubmit={handleSubmit} className="space-y-6" aria-busy={isProcessing}>
				<div>
					<label htmlFor="checkout-email" className="block text-sm font-medium text-gray-700 mb-2">
						{t('checkout.email')}
					</label>
					<Input
						id="checkout-email"
						type="email"
						autoComplete="email"
						required
						maxLength={254}
						value={email}
						onChange={(e) => {
							setEmail(e.target.value);
							if (emailError) setEmailError(null);
						}}
						onBlur={(e) => validateEmail(e.target.value)}
						placeholder="your@email.com"
						invalid={!!emailError}
						aria-invalid={!!emailError}
						aria-describedby={emailError ? 'checkout-email-error' : undefined}
					/>
					{emailError && (
						<p id="checkout-email-error" className="mt-1 text-sm text-danger" role="alert">{emailError}</p>
					)}
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						{t('checkout.shippingAddress')}
					</label>
					<p className="text-sm text-brand bg-brand/5 border border-brand/20 rounded-md px-3 py-2 mb-3" role="note">
						{t('checkout.japanOnlyShipping')}
					</p>
					<AddressElement
						options={{
							mode: 'shipping',
							allowedCountries: ['JP']
						}}
						onChange={(event) => {
							if (event.complete) {
								setAddressData(event.value);
							}
						}}
					/>
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						{t('checkout.paymentDetails')}
					</label>
					<PaymentElement
						options={{ layout: 'tabs' }}
						onReady={() => {
							setPaymentElementReady(true);
						}}
						onLoadError={(event) => {
							setPaymentElementReady(false);
							setErrorMessage(event.error?.message || t('checkout.stripeLoadFailedDescription'));
						}}
					/>
				</div>

				{/* Timeout status UI */}
				{timeoutState.active && (
					<div className="rounded-md bg-yellow-50 border border-yellow-200 p-4" role="status" aria-live="polite">
						{timeoutState.confirmed ? (
							<div className="flex items-center gap-3">
								<svg className="h-5 w-5 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
								</svg>
								<p className="text-sm text-success font-medium">{t('checkout.paymentTimeoutConfirmed')}</p>
							</div>
						) : (
							<div className="space-y-2">
								<div className="flex items-center gap-3">
									{timeoutState.checking ? (
										<svg className="h-5 w-5 animate-spin text-yellow-600 shrink-0" viewBox="0 0 24 24" fill="none" aria-label="読み込み中">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
										</svg>
									) : (
										<svg className="h-5 w-5 text-yellow-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									)}
									<p className="text-sm text-yellow-800 font-medium">
										{timeoutState.checking
											? t('checkout.paymentTimeoutChecking')
											: t('checkout.paymentTimeoutProcessing')}
									</p>
								</div>
								<p className="text-sm text-yellow-700 ml-8">{t('checkout.paymentTimeoutGuidance')}</p>
								{!timeoutState.checking && orderToken && (
									<button
										type="button"
										onClick={() => pollPaymentStatus(orderToken)}
										className="ml-8 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
									>
										{t('errors.retry')}
									</button>
								)}
							</div>
						)}
					</div>
				)}

				{/* Error message with retry action */}
				<div aria-live="assertive">
					{errorMessage && !timeoutState.active && (
						<div className="rounded-md bg-danger-light p-4" role="alert">
							<p className="text-sm text-danger">{errorMessage}</p>
							<button
								type="button"
								onClick={() => {
									setErrorMessage(null);
									formRef.current?.requestSubmit();
								}}
								className="mt-2 text-sm font-medium text-danger underline hover:text-danger/80"
							>
								{t('errors.retry')}
							</button>
						</div>
					)}
				</div>

				{/* Submit button */}
				<Button
					type="submit"
					disabled={!stripe || isProcessing || !paymentElementReady || timeoutState.active}
					aria-busy={isProcessing}
					aria-label={isProcessing ? t('checkout.processing') : t('checkout.payNow')}
					color="dark/zinc"
					className="w-full min-h-[44px] touch-manipulation"
				>
					{isProcessing ? (
						<span className="inline-flex items-center gap-2">
							<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
							{t('checkout.processing')}
						</span>
					) : t('checkout.payNow')}
				</Button>
			</form>
		</>
	);
}

export default function CheckoutForm({
	clientSecret,
	orderToken,
	publishableKey,
	items,
	breakdown
}: CheckoutFormProps) {
	const { t } = useTranslation();
	const [stripeLoadError, setStripeLoadError] = useState(false);

	const stripePromise = publishableKey ? getStripePromise(publishableKey) : null;

	useEffect(() => {
		if (!stripePromise) return;
		stripePromise
			.then((stripe) => {
				if (!stripe) setStripeLoadError(true);
			})
			.catch(() => {
				setStripeLoadError(true);
			});
	}, [stripePromise]);

	if (stripeLoadError) {
		return (
			<div className="bg-white rounded-lg shadow-sm p-6 text-center">
				<div className="text-danger mb-4">
					<svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<p className="text-lg font-medium text-gray-900 mb-2">{t('checkout.stripeLoadFailed')}</p>
				<p className="text-sm text-gray-600 mb-4">{t('checkout.stripeLoadFailedDescription')}</p>
				<Button
					type="button"
					outline
					onClick={() => {
					stripePromiseCache.delete(publishableKey);
					setStripeLoadError(false);
				}}
				>
					{t('errors.reload')}
				</Button>
			</div>
		);
	}

	if (!clientSecret || !stripePromise) {
		return (
			<div className="bg-white rounded-lg shadow-sm p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-4 bg-gray-200 rounded w-3/4"></div>
					<div className="h-10 bg-gray-200 rounded"></div>
					<div className="h-10 bg-gray-200 rounded"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-lg shadow-sm p-6">
			<h2 className="text-lg font-medium text-gray-900 mb-6">
				{t('checkout.title')}
			</h2>

			<Elements
				stripe={stripePromise}
				options={{
					clientSecret,
					appearance: {
						theme: 'stripe',
						variables: {
							colorPrimary: '#0071e3'
						}
					},
					locale: 'ja'
				}}
			>
				<CheckoutFormInner
					orderToken={orderToken}
					items={items}
					breakdown={breakdown}
				/>
			</Elements>
		</div>
	);
}
