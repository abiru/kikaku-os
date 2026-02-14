import { useState } from 'react';
import { Elements, PaymentElement, AddressElement, ExpressCheckoutElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import { useTranslation } from '../i18n';

// Singleton cache: loadStripe should only be called once per publishable key
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
	const cached = stripePromiseCache.get(publishableKey);
	if (cached) return cached;
	const promise = loadStripe(publishableKey);
	stripePromiseCache.set(publishableKey, promise);
	return promise;
}

type CheckoutFormProps = {
	clientSecret: string | null;
	orderToken: string | null;
	publishableKey: string;
};

function CheckoutFormInner({ orderToken, email, onEmailChange }: { orderToken: string | null; email: string; onEmailChange: (email: string) => void }) {
	const { t } = useTranslation();
	const stripe = useStripe();
	const elements = useElements();
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!stripe || !elements || !orderToken) {
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			// Get the address from AddressElement
			const addressElement = elements.getElement('address');
			let shippingData = null;

			if (addressElement) {
				const { complete, value } = await addressElement.getValue();
				if (complete && value) {
					shippingData = {
						name: value.name,
						address: {
							line1: value.address.line1,
							line2: value.address.line2 || undefined,
							city: value.address.city,
							state: value.address.state,
							postal_code: value.address.postal_code,
							country: value.address.country
						},
						phone: value.phone || undefined
					};
				}
			}

			const { error } = await stripe.confirmPayment({
				elements,
				confirmParams: {
					return_url: `${window.location.origin}/checkout/success?order_id=${orderToken}`,
					receipt_email: email,
					...(shippingData ? { shipping: shippingData } : {})
				}
			});

			if (error) {
				setErrorMessage(error.message || 'Payment failed');
				setIsProcessing(false);
			}
			// If successful, user will be redirected by Stripe
		} catch (err) {
			console.error('Payment error:', err);
			const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
			setErrorMessage(errorMsg);
			setIsProcessing(false);
		}
	};

	const onExpressCheckoutConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
		// Extract shipping address if available
		let shippingData = null;
		if (event.shippingAddress) {
			shippingData = {
				name: event.shippingAddress.name,
				address: {
					line1: event.shippingAddress.address.line1,
					line2: event.shippingAddress.address.line2 || undefined,
					city: event.shippingAddress.address.city,
					state: event.shippingAddress.address.state,
					postal_code: event.shippingAddress.address.postal_code,
					country: event.shippingAddress.address.country
				}
			};
		}

		// Complete the payment
		if (!stripe || !elements || !orderToken) return;

		try {
			const { error } = await stripe.confirmPayment({
				elements,
				confirmParams: {
					return_url: `${window.location.origin}/checkout/success?order_id=${orderToken}`,
					...(shippingData ? { shipping: shippingData } : {})
				}
			});

			if (error) {
				console.error('[Express Checkout] Error:', error);
			}
		} catch (err) {
			console.error('[Express Checkout] Exception:', err);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{/* Express Checkout (Apple Pay / Google Pay) */}
			<div>
				<ExpressCheckoutElement
					onConfirm={onExpressCheckoutConfirm}
					options={{
						buttonType: {
							applePay: 'buy',
							googlePay: 'buy'
						}
					}}
				/>
			</div>

			{/* Divider */}
			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-gray-300"></div>
				</div>
				<div className="relative flex justify-center text-sm">
					<span className="px-2 bg-white text-gray-500">{t('common.or')}</span>
				</div>
			</div>

			{/* Email input */}
			<div>
				<label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
					{t('checkout.email')}
				</label>
				<input
					type="email"
					id="email"
					required
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
					className="block w-full rounded-[5px] border border-[#e6e6e6] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base px-3 py-3"
					placeholder="your@email.com"
				/>
			</div>

			{/* Address Element - shipping address */}
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-2">
					{t('checkout.shippingAddress')}
				</label>
				<AddressElement
					options={{
						mode: 'shipping',
						allowedCountries: ['JP']
					}}
				/>
			</div>

			{/* Payment Element */}
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-2">
					{t('checkout.paymentDetails')}
				</label>
				<PaymentElement
					options={{
						layout: 'tabs'
					}}
				/>
			</div>

			{/* Error message */}
			{errorMessage && (
				<div className="rounded-md bg-red-50 p-4">
					<p className="text-sm text-red-800">{errorMessage}</p>
				</div>
			)}

			{/* Submit button */}
			<button
				type="submit"
				disabled={!stripe || isProcessing}
				className="w-full rounded-md bg-indigo-600 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
			>
				{isProcessing ? t('checkout.processing') : t('checkout.payNow')}
			</button>
		</form>
	);
}

export default function CheckoutForm({
	clientSecret,
	orderToken,
	publishableKey
}: CheckoutFormProps) {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');

	const stripePromise = publishableKey ? getStripePromise(publishableKey) : null;

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
							colorPrimary: '#4f46e5'
						}
					},
					locale: 'ja'
				}}
			>
				<CheckoutFormInner orderToken={orderToken} email={email} onEmailChange={setEmail} />
			</Elements>
		</div>
	);
}
